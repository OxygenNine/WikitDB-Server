/**
 * 站点「归属资料页面」解析与作者分数聚合
 * 归属资料页（如 backrooms-wiki-cn 的 /attribution-metadata）是一张结构化表格：
 *   标题（页面名） | 用户 | 类型 | 时间(可选 YYYY-MM-DD)
 * 类型：作者 / 重写 / 翻译 / 维护者。同一页面可有多个归属（合著/重写/翻译）。
 * 分数分配：页面的评分按「去重后的归属用户」均分给各归属用户。
 */
const cheerio = require('cheerio');

/** 页面名 → 用于与 listpages 对齐的规范化 key（去掉 category 前缀后的名称） */
function normalizePageKey(page) {
    const s = String(page || '').trim();
    // 取最后一个 ':' 之后的部分作为对齐 key（如 author:ounasvaara → ounasvaara）
    const idx = s.lastIndexOf(':');
    return (idx >= 0 ? s.slice(idx + 1) : s).toLowerCase();
}

/** 从归属资料页 HTML 中解析表格，返回 [{ page, username, type, date }] */
function parseAttributionHtml(html) {
    const $ = cheerio.load(String(html || ''));
    const records = [];
    const seen = new Set();

    $('#page-content table tr').each((_, tr) => {
        const $tr = $(tr);
        const cells = $tr.find('th, td').map((_, td) => $(td).text().trim()).get();
        if (cells.length < 3) return;

        const page = (cells[0] || '').trim();
        const username = (cells[1] || '').trim();
        const type = (cells[2] || '').trim();
        const date = ((cells[3] || '').trim() || '');

        // 跳过表头 / 空行
        if (!page || !username) return;
        if (page === '标题' || username === '用户') return;
        if (!/作者|重写|翻译|维护者/.test(type)) return;

        const key = `${page}\u0000${username}\u0000${type}\u0000${date}`;
        if (seen.has(key)) return;
        seen.add(key);

        records.push({
            page,
            username,
            type,
            date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
        });
    });

    return records;
}

/**
 * 抓取归属资料页面并解析
 * @param {{URL: string, ATTRIBUTION_PAGE?: string}} siteConfig 站点配置
 * @param {import('axios').AxiosInstance} request axios 实例（带超时）
 * @returns {Promise<Array>} [{ page, username, type, date }]
 */
async function fetchAttributionPage(siteConfig, request) {
    const pageName = (siteConfig.ATTRIBUTION_PAGE || '').trim();
    if (!pageName) return [];
    const baseUrl = siteConfig.URL.replace(/\/$/, '');
    const res = await request.get(`${baseUrl}/${encodeURIComponent(pageName)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    return parseAttributionHtml(res.data);
}

/**
 * 根据归属记录与页面评分，聚合作者分数。
 * @param {Array<{page:string, username:string, type:string}>} attributions
 * @param {Map<string, {rating:number}>} pageRatings 页面名(小写 key) → { rating }
 * @returns {Object} { [username]: { score, pages, average, pageNames: [] } }
 */
function aggregateAuthorScores(attributions, pageRatings) {
    const result = {};

    // 每个页面的去重归属用户
    const pageUsers = {};
    for (const a of attributions || []) {
        const key = normalizePageKey(a.page);
        if (!pageUsers[key]) pageUsers[key] = [];
        if (!pageUsers[key].some(u => u.toLowerCase() === String(a.username).toLowerCase())) {
            pageUsers[key].push(a.username);
        }
    }

    for (const [pageKey, users] of Object.entries(pageUsers)) {
        const rating = pageRatings && pageRatings.get(pageKey) ? pageRatings.get(pageKey).rating || 0 : 0;
        const share = users.length ? rating / users.length : 0;

        for (const user of users) {
            const uk = String(user).toLowerCase();
            if (!result[uk]) {
                result[uk] = { name: user, score: 0, pages: 0, average: 0, pageNames: [] };
            }
            result[uk].score += share;
            result[uk].pages += 1;
            result[uk].pageNames.push(pageKey);
        }
    }

    // 计算平均分
    for (const k of Object.keys(result)) {
        result[k].average = result[k].pages ? result[k].score / result[k].pages : 0;
        result[k].average = Math.round(result[k].average * 100) / 100;
        result[k].score = Math.round(result[k].score * 100) / 100;
    }

    return result;
}

module.exports = { parseAttributionHtml, fetchAttributionPage, aggregateAuthorScores, normalizePageKey };
