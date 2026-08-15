import axios from 'axios';
import * as cheerio from 'cheerio';
import { withAuth } from '../../../utils/withAuth';
import {
    buildTimerIframe,
    buildAnnouncementText,
    buildAnnouncementTitle,
    parsePageName,
    mergeTags
} from '../../../utils/staffPostDeletion';
const config = require('../../../wikitdb.config.js');

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
 * 给页面添加「待删除」标签（通过 Wikidot 标签编辑页）
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

    // 从标签编辑表单读取现有标签（textarea name="tags"）
    let existing = [];
    $('#edit-tags-form textarea[name="tags"]').each((_, el) => {
        existing = String($(el).val() || '').split(',').map((t) => t.trim()).filter(Boolean);
    });
    // 若表单结构不同，退回从页面标签链接解析
    if (existing.length === 0) {
        $('.page-tags a, .page-tags span').each((_, el) => {
            const text = $(el).text().trim();
            if (text) existing.push(text);
        });
    }
    const newTags = mergeTags(existing, tagName);

    const postRes = await axios.post(editUrl, new URLSearchParams({
        wikidot_token7: token,
        tags: newTags.join(', ')
    }).toString(), {
        headers: { ...buildHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    return { tags: newTags, httpStatus: postRes.status };
}

/**
 * 从页面 HTML 提取讨论区 catId / threadId
 * @returns {Promise<{categoryId: string|null, threadId: string|null}>}
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

    // 先 GET 目标论坛页面提取真实 token，再提交
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

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '仅支持 POST' });
    }

    const {
        site,
        pages,
        botUsername,
        botPassword,
        deleteScore,
        countdownHours,
        tagName,
        timerBaseUrl,
        customTimerIframe,
        announcementText
    } = req.body || {};

    if (!site) return res.status(400).json({ error: '请选择站点' });
    const siteConfig = config.SUPPORT_WIKI.find((w) => w.PARAM === site);
    if (!siteConfig) return res.status(400).json({ error: '未找到该站点配置' });

    if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: '请至少提供一个页面' });
    }

    const username = (botUsername || '').trim() || process.env.WIKIDOT_BOT_USER || '';
    const password = (botPassword || '') || process.env.WIKIDOT_BOT_PASS || '';
    if (!username || !password) {
        return res.status(400).json({ error: '请填写机器人账号和密码（或确认服务器已配置默认 Bot）' });
    }

    const baseUrl = siteConfig.URL.replace(/\/$/, '');
    const finalTag = (tagName || '待删除').trim() || '待删除';

    // 生成计时器 iframe（可用自定义代码覆盖）
    const autoBaseUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || ''}/timer/timer.html`;
    const generatedIframe = buildTimerIframe(timerBaseUrl || autoBaseUrl, {
        deleteScore,
        countdownHours
    });
    const finalIframe = (customTimerIframe || '').trim() || generatedIframe;

    let cookie;
    try {
        cookie = await login(username, password);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const results = [];
    let okCount = 0;
    let failCount = 0;

    for (const raw of pages) {
        const pageName = parsePageName(raw);
        if (!pageName) {
            results.push({ page: String(raw || ''), status: 'error', message: '页面名无效' });
            failCount++;
            continue;
        }

        const result = { page: pageName, status: 'error' };
        try {
            // 1. 添加「待删除」标签
            const tagRes = await addTag(baseUrl, pageName, cookie, finalTag);
            await sleep(1200);

            // 2. 发布删帖公告
            const text = (announcementText || '').trim()
                ? announcementText
                : buildAnnouncementText({ deleteScore, timerIframe: finalIframe, pageName });
            const title = buildAnnouncementTitle();
            const postRes = await postAnnouncement(baseUrl, pageName, cookie, title, text);

            result.status = 'success';
            result.tag = finalTag;
            result.tags = tagRes.tags;
            result.target = postRes.target;
            result.httpStatus = postRes.httpStatus;
            okCount++;
        } catch (e) {
            result.message = e.message;
            failCount++;
        }
        results.push(result);
        await sleep(1200);
    }

    return res.status(200).json({
        success: failCount === 0,
        ok: okCount,
        fail: failCount,
        results,
        timerIframe: finalIframe
    });
}

export default withAuth(handler);


