/**
 * Wikidot 职员操作公共库（登录 / 打标签 / 发公告）
 * 供 staff-post-deletion API 与 auto-crawler 自动删帖扫描共用。
 */
const axios = require('axios');
const cheerio = require('cheerio');

const LOGIN_URL = 'https://www.wikidot.com/default--flow/login__LoginPopupScreen';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 登录会话缓存：Wikidot session 有效期很长，复用可避免频繁登录触发限流
const LOGIN_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时
let loginCache = { username: '', cookie: '', expiresAt: 0 };

/** 清除登录缓存（session 失效时调用，下次登录会重新获取） */
function clearLoginCache() {
    loginCache = { username: '', cookie: '', expiresAt: 0 };
}

/** 验证 session 是否真实有效（未登录/限流时 Wikidot 会返回无效 session） */
async function verifySession(cookie, username) {
    try {
        const res = await axios.get('https://www.wikidot.com/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': cookie },
            validateStatus: (s) => true,
            timeout: 15000
        });
        return String(res.data).includes(username);
    } catch (e) {
        return false;
    }
}

/** 登录 Wikidot，返回带会话的 Cookie 字符串（优先复用缓存，登录后验证 session 有效） */
async function login(username, password) {
    const now = Date.now();
    if (loginCache.username === username && loginCache.cookie && now < loginCache.expiresAt) {
        return loginCache.cookie;
    }

    let lastErr = null;
    // 失败重试（最多 3 次，规避限流/临时失败）
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const payload = new URLSearchParams({
                login: username,
                password,
                action: 'Login2Action',
                event: 'login'
            });
            const res = await axios.post(LOGIN_URL, payload.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                maxRedirects: 0,
                validateStatus: (s) => s >= 200 && s < 400,
                timeout: 20000
            });
            const cookies = res.headers['set-cookie'] || [];
            let sessionId = '';
            let token7 = '123456';
            for (const c of cookies) {
                const m = String(c).match(/WIKIDOT_SESSION_ID=([^;]+)/);
                if (m) {
                    sessionId = m[1];
                }
                const tm = String(c).match(/wikidot_token7=([^;]+)/);
                if (tm) {
                    token7 = tm[1];
                }
            }
            if (!sessionId) throw new Error('登录响应缺少会话');

            const cookie = `WIKIDOT_SESSION_ID=${sessionId}; wikidot_token7=${token7};`;
            // 验证 session 真实有效（限流时返回的 session 无效）
            const valid = await verifySession(cookie, username);
            if (!valid) throw new Error('登录 session 未验证通过（可能被限流）');

            loginCache = { username, cookie, expiresAt: now + LOGIN_CACHE_TTL_MS };
            return cookie;
        } catch (e) {
            lastErr = e;
            await sleep(5000 * attempt);
        }
    }
    throw new Error(`机器人账号登录失败：${lastErr ? lastErr.message : '未知错误'}`);
}

function buildHeaders(cookie) {
    return {
        'User-Agent': UA,
        'Cookie': cookie
    };
}

/** 从 HTML 中提取 wikidot_token7（CSRF token），失败则回退默认值 */
function extractToken(html) {
    const m = String(html || '').match(/name="wikidot_token7"\s+value="([^"]+)"/);
    return m ? m[1] : '123456';
}

/** 从 cookie 提取 wikidot_token7 */
function extractToken7(cookie) {
    const m = String(cookie || '').match(/wikidot_token7=([^;]+)/);
    return m ? m[1] : '123456';
}

/**
 * 给页面添加标签（通过 Wikidot saveTags 接口）
 * 流程：GET 页面取 pageId + 现有标签 → 合并 → POST action=WikiPageAction&event=saveTags
 * @returns {Promise<{tags: string[], httpStatus: number}>}
 */
async function addTag(baseUrl, pageName, cookie, tagName) {
    // 1. 获取页面 pageId 与现有标签
    const pageUrl = `${baseUrl}/${encodeURIComponent(pageName)}`;
    const pageRes = await axios.get(pageUrl, {
        headers: buildHeaders(cookie),
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const $ = cheerio.load(pageRes.data);
    const pageIdMatch = String(pageRes.data).match(/WIKIREQUEST\.info\.pageId\s*=\s*(\d+)/);
    if (!pageIdMatch) {
        throw new Error(`无法获取页面 ID（页面可能不存在或无权限）：${pageName}`);
    }
    const pageId = pageIdMatch[1];

    // 现有标签
    const existing = [];
    $('.page-tags a').each((_, el) => {
        const text = $(el).text().trim();
        if (text) existing.push(text);
    });
    // 去重合并新标签
    const merged = existing.filter((t, i) => existing.indexOf(t) === i);
    const normalized = tagName ? String(tagName).trim() : '';
    if (normalized && !merged.includes(normalized)) merged.push(normalized);

    // 2. 调用 saveTags 保存标签（空格分隔）
    const postRes = await axios.post(`${baseUrl}/ajax-module-connector.php`, new URLSearchParams({
        tags: merged.join(' '),
        pageId,
        action: 'WikiPageAction',
        event: 'saveTags',
        wikidot_token7: extractToken7(cookie)
    }).toString(), {
        headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });

    const data = postRes.data;
    if (data && typeof data === 'object' && data.status && data.status !== 'ok') {
        throw new Error(`保存标签失败: ${data.message || data.status}`);
    }
    return { tags: merged, httpStatus: postRes.status };
}

/**
 * 从页面 HTML 提取讨论区 catId / threadId
 */
async function findDiscussion(baseUrl, pageName, cookie) {
    const pageUrl = `${baseUrl}/${encodeURIComponent(pageName)}`;
    const pageRes = await axios.get(pageUrl, {
        headers: buildHeaders(cookie),
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const $ = cheerio.load(pageRes.data);

    let href = '';
    if ($('#discuss-button').length) href = $('#discuss-button').attr('href') || '';
    if (!href) {
        href = $('#page-info a[href*="/forum/"], #page-options-bottom a[href*="/forum/"], #page-options a[href*="/forum/"]')
            .first().attr('href') || '';
    }

    const catMatch = href.match(/\/forum\/c-(\d+)/);
    const threadMatch = href.match(/\/forum\/t-(\d+)/);
    return {
        categoryId: catMatch ? catMatch[1] : null,
        threadId: threadMatch ? threadMatch[1] : null
    };
}

/**
 * 在页面讨论区发布删帖公告
 *  - 已有线程 threadId：通过 ForumNewPostFormModule + ForumAction/savePost 发回复
 *  - 仅分类 categoryId：创建新主题（ForumAction/saveThread）
 * @returns {Promise<{categoryId: string|null, threadId: string|null, target: string, httpStatus: number}>}
 */
async function postAnnouncement(baseUrl, pageName, cookie, title, text) {
    const { categoryId, threadId } = await findDiscussion(baseUrl, pageName, cookie);
    const ajaxUrl = `${baseUrl}/ajax-module-connector.php`;
    const token7 = extractToken7(cookie);

    let url = '';
    let label = '';
    let params = {};

    if (threadId) {
        // 发新回复到已有线程
        // 1. 加载发帖表单获取真实 token
        try {
            const formRes = await axios.post(ajaxUrl, new URLSearchParams({
                moduleName: 'forum/sub/ForumNewPostFormModule',
                threadId,
                wikidot_token7: token7
            }).toString(), {
                headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 20000,
                validateStatus: (s) => s >= 200 && s < 400
            });
            const formBody = typeof formRes.data === 'string' ? formRes.data : JSON.stringify(formRes.data || '');
            const fm = String(formBody).match(/wikidot_token7[^>]*value="([^"]+)"/);
            if (fm) params.wikidot_token7 = fm[1];
        } catch (e) { /* 用默认 token */ }

        params.action = 'ForumAction';
        params.event = 'savePost';
        params.threadId = threadId;
        params.source = text; // Wikidot 发帖字段名是 source（非 text）
        if (!params.wikidot_token7) params.wikidot_token7 = token7;
        url = ajaxUrl;
        label = `线程 t-${threadId}`;
    } else if (categoryId) {
        // 创建新主题
        params.action = 'ForumAction';
        params.event = 'saveThread';
        params.categoryId = categoryId;
        params.title = title;
        params.source = text;
        params.wikidot_token7 = token7;
        url = ajaxUrl;
        label = `分类 c-${categoryId}`;
    } else {
        throw new Error('未找到页面讨论区（无法从页面解析 catId/threadId）');
    }

    const postRes = await axios.post(url, new URLSearchParams(params).toString(), {
        headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });

    const data = postRes.data;
    if (data && typeof data === 'object' && data.status && data.status !== 'ok') {
        throw new Error(`发布公告失败: ${data.message || data.status}`);
    }
    return { categoryId, threadId, target: label, httpStatus: postRes.status };
}

module.exports = {
    login,
    clearLoginCache,
    verifySession,
    buildHeaders,
    extractToken,
    addTag,
    findDiscussion,
    postAnnouncement,
    sleep
};
