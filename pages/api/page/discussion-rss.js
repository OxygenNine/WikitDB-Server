import prisma from '../../../lib/prisma';
import { withLogging } from '../../../utils/logRequest';
import { fetchPageDiscussionRss } from '../../../utils/wikidotPageRss';
const config = require('../../../wikitdb.config.js');

// RSS 结果缓存 30 分钟
const CACHE_TTL_MS = 30 * 60 * 1000;

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wiki, page } = req.query;
    if (!wiki || !page) return res.status(400).json({ error: '缺少 wiki / page 参数' });

    const siteConfig = config.SUPPORT_WIKI.find(s => s.PARAM === wiki);
    if (!siteConfig) return res.status(404).json({ error: '未找到该站点配置' });

    const cacheKey = `page-rss:v2:${wiki}:${page}`;

    // 1. 读缓存
    try {
        const record = await prisma.setting.findUnique({ where: { key: cacheKey } });
        if (record && record.value) {
            const parsed = JSON.parse(record.value);
            if (parsed && parsed._ts && Date.now() - parsed._ts < CACHE_TTL_MS) {
                const { _ts, ...data } = parsed;
                return res.status(200).json(data);
            }
        }
    } catch (e) { /* 缓存读取失败则重新抓取 */ }

    // 2. 抓取 RSS
    try {
        const result = await fetchPageDiscussionRss(siteConfig, page);

        // 3. 写缓存
        try {
            await prisma.setting.upsert({
                where: { key: cacheKey },
                update: { value: JSON.stringify({ ...result, _ts: Date.now() }) },
                create: { key: cacheKey, value: JSON.stringify({ ...result, _ts: Date.now() }) }
            });
        } catch (e) { /* 缓存写入失败不影响响应 */ }

        return res.status(200).json(result);
    } catch (err) {
        console.error('Page RSS 抓取失败:', err.message);
        const isNotFound = /404|页面不存在/.test(err.message || '');
        return res.status(isNotFound ? 404 : 502).json({
            error: isNotFound ? '页面不存在或无法访问' : 'RSS 获取失败，请稍后重试',
            details: err.message,
        });
    }
}

export default withLogging(handler);
