import { withAuth } from '../../../utils/withAuth';
import {
    buildTimerIframe,
    buildAnnouncementText,
    buildAnnouncementTitle,
    parsePageName
} from '../../../utils/staffPostDeletion';
const { login, addTag, postAnnouncement, sleep } = require('../../../utils/wikidotStaffActions');
const config = require('../../../wikitdb.config.js');

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


