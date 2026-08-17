import prisma from '../../lib/prisma';
import { withLogging } from '../../utils/logRequest';
const config = require('../../wikitdb.config.js');

/**
 * 作者归属与分数分配 API
 * GET /api/attribution?site=brcn                  -> 站点归属记录 + 作者分数 + 页面评分
 * GET /api/attribution?site=brcn&author=某某       -> 该作者的归属页面与分数
 */
async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const site = String(req.query.site || '').trim();
    const author = String(req.query.author || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 100, 1), 500);

    const siteConfig = config.SUPPORT_WIKI.find(w => w.PARAM === site);
    if (!siteConfig) return res.status(400).json({ error: '未找到该站点配置' });

    try {
        // 作者维度查询
        if (author) {
            const aName = author.trim();
            const where = { siteParam: site, username: aName };
            const [total, rows] = await Promise.all([
                prisma.authorAttribution.count({ where }),
                prisma.authorAttribution.findMany({
                    where,
                    orderBy: { page: 'asc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize
                })
            ]);

            // 该作者在归属页中页面名集合（用于聚合分数）
            const scoreRecord = await prisma.setting.findUnique({ where: { key: `author_score:${site}` } });
            let authorScore = null;
            if (scoreRecord && scoreRecord.value && scoreRecord.value[aName.toLowerCase()]) {
                authorScore = scoreRecord.value[aName.toLowerCase()];
            }

            return res.status(200).json({
                site,
                siteName: siteConfig.NAME,
                attributionPage: siteConfig.ATTRIBUTION_PAGE || null,
                author: aName,
                authorScore,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
                attributions: rows
            });
        }

        // 站点维度：归属 + 分数 + 页面评分
        const [attributionCount, attributions, scoreRecord, pageScoreRecord] = await Promise.all([
            prisma.authorAttribution.count({ where: { siteParam: site } }),
            prisma.authorAttribution.findMany({
                where: { siteParam: site },
                orderBy: { page: 'asc' },
                take: 2000
            }),
            prisma.setting.findUnique({ where: { key: `author_score:${site}` } }),
            prisma.setting.findUnique({ where: { key: `page_scores:${site}` } })
        ]);

        const authorScores = (scoreRecord && scoreRecord.value) || {};
        const pageScores = (pageScoreRecord && pageScoreRecord.value) || [];

        return res.status(200).json({
            site,
            siteName: siteConfig.NAME,
            attributionPage: siteConfig.ATTRIBUTION_PAGE || null,
            attributionCount,
            authorCount: Object.keys(authorScores).length,
            authorScores,
            pageScores,
            attributions
        });
    } catch (error) {
        console.error('[attribution] 查询失败:', error);
        return res.status(500).json({ error: '读取归属数据失败' });
    }
}

export default withLogging(handler);
