import * as cheerio from 'cheerio';

const PAGE_HTML_LIMIT = 2 * 1024 * 1024;
const SOURCE_RESPONSE_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10000;

function getSafeWikiOrigin(wikiConfig) {
    const url = new URL(wikiConfig.URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.wikidot.com')) {
        throw new Error('站点配置不是受支持的 HTTPS Wikidot 地址');
    }
    return url.origin;
}

async function readLimitedText(response, limit) {
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > limit) throw new Error('上游响应过大');

    const reader = response.body?.getReader();
    if (!reader) return (await response.text()).slice(0, limit);

    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            throw new Error('上游响应过大');
        }
        chunks.push(value);
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, {
            ...options,
            redirect: 'error',
            signal: controller.signal,
            cache: 'no-store',
        });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchWikidotSource(wikiConfig, pageName) {
    const origin = getSafeWikiOrigin(wikiConfig);
    const pageUrl = `${origin}/${pageName}`;
    const headers = {
        'User-Agent': 'WikitDB FTML Preview/1.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
    };

    const pageResponse = await fetchWithTimeout(pageUrl, { headers });
    if (!pageResponse.ok) throw new Error(`页面请求失败 (${pageResponse.status})`);
    const pageHtml = await readLimitedText(pageResponse, PAGE_HTML_LIMIT);
    const pageIdMatch = pageHtml.match(/pageId\s*[:=]\s*['"]?(\d+)['"]?/i)
        || pageHtml.match(/page_id\s*[:=]\s*['"]?(\d+)['"]?/i);
    if (!pageIdMatch) throw new Error('无法识别页面 ID');

    const ajaxResponse = await fetchWithTimeout(`${origin}/ajax-module-connector.php`, {
        method: 'POST',
        headers: {
            'User-Agent': headers['User-Agent'],
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Origin: origin,
            Referer: pageUrl,
            Cookie: 'wikidot_token7=123456;',
        },
        body: new URLSearchParams({
            page_id: pageIdMatch[1],
            moduleName: 'viewsource/ViewSourceModule',
            wikidot_token7: '123456',
        }).toString(),
    });
    if (!ajaxResponse.ok) throw new Error(`源码请求失败 (${ajaxResponse.status})`);

    const raw = await readLimitedText(ajaxResponse, SOURCE_RESPONSE_LIMIT);
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error('源码服务返回了无效数据');
    }
    if (data.status !== 'ok') throw new Error('源码服务拒绝请求');

    const $ = cheerio.load(data.body || '');
    const source = ($('.page-source').text() || $.root().text() || '').trim();
    if (!source) throw new Error('页面源码为空');
    return source;
}
