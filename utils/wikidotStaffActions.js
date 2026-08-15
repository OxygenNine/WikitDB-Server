/**
 * Wikidot 职员操作公共库（登录 / 打标签 / 发公告）
 * 供 staff-post-deletion API 与 auto-crawler 自动删帖扫描共用。
 */
const axios = require('axios');
const cheerio = require('cheerio');

const LOGIN_URL = 'https://www.wikidot.com/default--flow/login__LoginPopupScreen';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 登录 Wikidot，返回带会话的 Cookie 字符串 */
async function login(username, password) {
    const payload = new URLSearchParams({
        login: username,
        password,
        action: 'Login2Action',
        event: 'login'
    });
    const res = await axios.post(LOGIN_URL, payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WikitDB-Bot/1.0' },
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 20000
    });
    const cookies = res.headers['set-cookie'] || [];
    let sessionId = '';
    for (const c of cookies) {
        const m = String(c).match(/WIKIDOT_SESSION_ID=([^;]+)/);
        if (m) {
            sessionId = m[1];
            break;
        }
    }
    if (!sessionId) throw new Error('机器人账号登录失败：未能获取会话（请检查账号密码）');
    return `WIKIDOT_SESSION_ID=${sessionId}; wikidot_token7=123456;`;
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

/**
 * 给页面添加标签（通过 Wikidot 标签编辑页）
 * @returns {Promise<{tags: string[], httpStatus: number}>}
 */
async function addTag(baseUrl, pageName, cookie, tagName) {
    const editUrl = `${baseUrl}/page/edittags/${encodeURIComponent(pageName)}`;
    const getRes = await axios.get(editUrl, {
        headers: buildHeaders(cookie),
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const $ = cheerio.load(getRes.data);
    const token = extractToken(getRes.data);

    let existing = [];
    $('#edit-tags-form textarea[name="tags"]').each((_, el) => {
        existing = String($(el).val() || '').split(',').map((t) => t.trim()).filter(Boolean);
    });
    if (existing.length === 0) {
        $('.page-tags a, .page-tags span').each((_, el) => {
            const text = $(el).text().trim();
            if (text) existing.push(text);
        });
    }
    // 去重合并
    const merged = existing.filter((t, i) => existing.indexOf(t) === i);
    const normalized = tagName ? String(tagName).trim() : '';
    if (normalized && !merged.includes(normalized)) merged.push(normalized);

    const postRes = await axios.post(editUrl, new URLSearchParams({
        wikidot_token7: token,
        tags: merged.join(', ')
    }).toString(), {
        headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
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
 * 在页面讨论区发布公告
 *  - 已有线程 threadId：发新回复到 /forum/t-{threadId}
 *  - 仅分类 categoryId：创建新主题到 /forum/c-{categoryId}
 * @returns {Promise<{categoryId: string|null, threadId: string|null, target: string, httpStatus: number}>}
 */
async function postAnnouncement(baseUrl, pageName, cookie, title, text) {
    const { categoryId, threadId } = await findDiscussion(baseUrl, pageName, cookie);

    let url = '';
    let label = '';
    let params = {};

    if (threadId) {
        url = `${baseUrl}/forum/t-${threadId}`;
        label = `线程 t-${threadId}`;
        params = { wikidot_token7: '123456', text };
    } else if (categoryId) {
        url = `${baseUrl}/forum/c-${categoryId}`;
        label = `分类 c-${categoryId}`;
        params = { wikidot_token7: '123456', title, text };
    } else {
        throw new Error('未找到页面讨论区（无法从页面解析 catId/threadId）');
    }

    try {
        const getForum = await axios.get(url, {
            headers: buildHeaders(cookie),
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400
        });
        params.wikidot_token7 = extractToken(getForum.data);
    } catch (e) {
        /* token 提取失败则用默认值 */
    }

    const postRes = await axios.post(url, new URLSearchParams(params).toString(), {
        headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    return { categoryId, threadId, target: label, httpStatus: postRes.status };
}

module.exports = {
    login,
    buildHeaders,
    extractToken,
    addTag,
    findDiscussion,
    postAnnouncement,
    sleep
};
