/**
 * Wikidot 单页讨论 RSS 抓取
 *
 * 实现思路：
 *  1. 抓取页面 HTML
 *  2. 定位 option 栏（#page-options-bottom 中的 #discuss-button），提取讨论区 id（/forum/t-{id}）
 *  3. 请求 RSS：https://{site}.wikidot.com/feed/forum/t-{id}.xml
 *     （同时兼容 feed.forum/t-{id}.xml 格式）
 *  4. 解析 RSS 为结构化数据
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeRichHtml } = require('./htmlSanitizer');
const { wikidotLimiter } = require('./rateLimiter');

const REQUEST_TIMEOUT_MS = 12000;
const RSS_MAX_ITEMS = 50;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 尝试的 RSS URL 格式（按优先级）
const RSS_URL_FORMATS = [
    (baseUrl, threadId) => `${baseUrl}/feed.forum/t-${threadId}.xml`,
    (baseUrl, threadId) => `${baseUrl}/feed/forum/t-${threadId}.xml`,
];

/**
 * 从页面 HTML 中提取讨论区 id（threadId）
 * 定位策略：优先 option 栏中的 #discuss-button，其次 #page-options-bottom 内任何 forum/t- 链接
 * @param {string} pageHtml
 * @returns {string|null}
 */
function extractDiscussionThreadId(pageHtml) {
    const $ = cheerio.load(pageHtml);

    let href = '';
    const $discussButton = $('#discuss-button');
    if ($discussButton.length) href = $discussButton.attr('href') || '';

    if (!href || !href.includes('/forum/t-')) {
        const $optionLink = $('#page-options-bottom a[href*="/forum/t-"], #page-options a[href*="/forum/t-"]').first();
        if ($optionLink.length) href = $optionLink.attr('href') || '';
    }

    if (!href || !href.includes('/forum/t-')) return null;

    const match = href.match(/\/forum\/t-(\d+)/);
    return match ? match[1] : null;
}

/**
 * 解析 RSS XML 为结构化数据
 * @param {string} xml
 * @returns {{channelTitle, channelLink, description, lastBuildDate, items: Array}}
 */
function parseForumRss(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const $channel = $('rss channel').first();
    if (!$channel.length) throw new Error('不是有效的 RSS 数据');

    const text = (el) => (el ? el.text().trim() : '');

    const items = [];
    $channel.find('item').each((_, el) => {
        const $el = $(el);
        const guid = text($el.find('guid').first());
        const postIdMatch = guid.match(/#post-(\d+)/);

        // namespaced 元素（wikidot:authorName 等）在 cheerio 中需转义选择器，这里用正则兜底
        const itemHtml = $.html($el);
        const authorNameMatch = itemHtml.match(/<wikidot:authorName>([\s\S]*?)<\/wikidot:authorName>/i);
        const authorUserIdMatch = itemHtml.match(/<wikidot:authorUserId>([\s\S]*?)<\/wikidot:authorUserId>/i);
        const contentMatch = itemHtml.match(/<content:encoded>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/content:encoded>/i);

        items.push({
            postId: postIdMatch ? postIdMatch[1] : null,
            guid,
            title: text($el.find('title').first()) || '(无标题)',
            link: text($el.find('link').first()) || '',
            authorName: authorNameMatch ? authorNameMatch[1].trim() : '',
            authorUserId: authorUserIdMatch ? authorUserIdMatch[1].trim() : null,
            contentHtml: contentMatch
                ? sanitizeRichHtml(contentMatch[1].trim())
                : '',
            pubDate: text($el.find('pubDate').first()),
        });
    });

    return {
        channelTitle: text($channel.find('title').first()),
        channelLink: text($channel.find('link').first()),
        description: text($channel.find('description').first()),
        lastBuildDate: text($channel.find('lastBuildDate').first()),
        items: items.slice(0, RSS_MAX_ITEMS),
    };
}

/**
 * 抓取页面单页讨论的 RSS
 * @param {{URL: string}} siteConfig wikitdb.config.js 中的站点配置
 * @param {string} pageName 页面名（如 "major" 或 "scp-001"）
 * @returns {Promise<{hasDiscussion, threadId, threadUrl, rssUrl, rss}>}
 */
async function fetchPageDiscussionRss(siteConfig, pageName) {
    const baseUrl = (siteConfig.URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('站点配置缺少 URL');

    const pageUrl = `${baseUrl}/${encodeURIComponent(pageName)}`;
    const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' };

    // 1. 抓取页面 HTML
    let pageHtml;
    try {
        const pageRes = await axios.get(pageUrl, { headers, timeout: REQUEST_TIMEOUT_MS, maxRedirects: 3 });
        pageHtml = pageRes.data;
    } catch (e) {
        if (e.response && e.response.status === 404) {
            throw new Error('页面不存在或无法访问 (404)');
        }
        throw new Error(`页面抓取失败: ${e.message}`);
    }
    const threadId = extractDiscussionThreadId(pageHtml);

    if (!threadId) {
        return {
            hasDiscussion: false,
            threadId: null,
            threadUrl: '',
            rssUrl: '',
            rss: null,
        };
    }

    const threadUrl = `${baseUrl}/forum/t-${threadId}`;

    // 2. 请求 RSS（依次尝试 URL 格式）
    let rssData = null;
    let rssUrl = '';
    for (const format of RSS_URL_FORMATS) {
        const candidateUrl = format(baseUrl, threadId);
        try {
            await wikidotLimiter.wait(10000);
            const rssRes = await axios.get(candidateUrl, {
                headers,
                timeout: REQUEST_TIMEOUT_MS,
                validateStatus: s => s === 200,
            });
            rssData = parseForumRss(rssRes.data);
            rssUrl = candidateUrl;
            break;
        } catch (e) {
            // 尝试下一种格式
        }
    }

    return {
        hasDiscussion: true,
        threadId,
        threadUrl,
        rssUrl,
        rss: rssData,
    };
}

module.exports = { extractDiscussionThreadId, parseForumRss, fetchPageDiscussionRss };
