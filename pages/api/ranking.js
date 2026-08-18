import prisma from '../../lib/prisma';
const config = require('../../wikitdb.config.js');
const { DEFAULT_GQL_ENDPOINT, getGraphQLEndpoint } = require('../../utils/graphql');
const { cached } = require('../../utils/cache');
const { singleFlight } = require('../../utils/singleFlight');
const { wikitLimiter } = require('../../utils/rateLimiter');
import { withLogging } from '../../utils/logRequest';

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { site = 'global' } = req.query;

    try {
        // 优先使用站点归属资料分数生成排行榜（配置了归属页的站点）
        let attributionRanking = null;
        try {
            if (site === 'global') {
                const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'author_score:' } } });
                const agg = {};
                for (const s of settings) {
                    const scores = s.value; // lib/prisma 已自动解析
                    if (!scores) continue;
                    for (const [k, v] of Object.entries(scores)) {
                        if (!agg[k]) agg[k] = { name: v.name, score: 0 };
                        agg[k].score += v.score || 0;
                    }
                }
                if (Object.keys(agg).length > 0) {
                    attributionRanking = Object.values(agg)
                        .sort((a, b) => b.score - a.score)
                        .map((v, i) => ({ rank: i + 1, name: v.name, value: Math.round(v.score * 100) / 100 }));
                }
            } else {
                const rec = await prisma.setting.findUnique({ where: { key: `author_score:${site}` } });
                if (rec && rec.value && Object.keys(rec.value).length > 0) {
                    attributionRanking = Object.values(rec.value)
                        .sort((a, b) => b.score - a.score)
                        .map((v, i) => ({ rank: i + 1, name: v.name, value: Math.round(v.score * 100) / 100 }));
                }
            }
        } catch (e) {
            console.error('[ranking] 归属排行榜计算失败:', e.message);
        }

        if (attributionRanking) {
            res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
            return res.status(200).json({ site, source: 'attribution', ranking: attributionRanking });
        }

        const fetchGraphQL = async (queryStr, variables, endpoint = DEFAULT_GQL_ENDPOINT) => {
            await wikitLimiter.wait(8000);
            const gqlRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryStr, variables }),
                cache: 'no-store'
            });

            const text = await gqlRes.text();

            try {
                const json = JSON.parse(text);

                if (json.errors) {
                    throw new Error(json.errors[0].message);
                }

                if (json.data && json.data.authorRanking) {
                    return json.data.authorRanking;
                }

                return [];
            } catch (e) {
                if (e.name === 'SyntaxError') {
                    throw new Error(`Wikit 接口崩溃 (非 JSON): ${text.substring(0, 60)}...`);
                }
                throw e;
            }
        };

        // 缓存 10 分钟 + 请求去重
        const cacheKey = `ranking:${site}`;
        const rankingData = await singleFlight(cacheKey, () =>
            cached(cacheKey, async () => {
                if (site === 'global') {
                    return fetchGraphQL(`query { authorRanking(by: RATING) { rank name value } }`);
                }

                const wikiConfig = config.SUPPORT_WIKI.find(w => w.PARAM === site);
                if (!wikiConfig) throw new Error('NOT_FOUND');

                let actualWikiName = '';
                try {
                    const urlObj = new URL(wikiConfig.URL);
                    actualWikiName = urlObj.hostname.replace(/^www\./i, '').split('.')[0];
                } catch (e) {
                    actualWikiName = wikiConfig.URL.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('.')[0];
                }

                return fetchGraphQL(
                    `query($wiki: String!) { authorRanking(wiki: $wiki, by: RATING) { rank name value } }`,
                    { wiki: actualWikiName },
                    getGraphQLEndpoint(wikiConfig)
                );
            }, 10 * 60 * 1000)
        );

        if (rankingData === 'NOT_FOUND') {
            return res.status(404).json({ error: '未找到指定的站点配置' });
        }

        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
        res.status(200).json({ site, ranking: rankingData });

    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: '未找到指定的站点配置' });
        }
        res.status(500).json({ error: '排行榜数据获取失败' });
    }
}

export default withLogging(handler);
