import { withCsrf } from '../../../utils/csrf';
import { getClientIp, ipRateLimit } from '../../../utils/security';
import { fetchWikidotSource } from '../../../utils/wikidotSource';
const config = require('../../../wikitdb.config.js');
const {
    parseIncludeDirective,
    resolveIncludeTarget,
    substituteVariables,
} = require('../../../utils/ftmlIncludes');

const INCLUDE_PATTERN = /\[\[\s*include\s+([\s\S]*?)\]\]/gi;
const MAX_SOURCE_LENGTH = 300000;
const MAX_EXPANDED_LENGTH = 500000;
const MAX_DEPTH = 4;
const MAX_INCLUDES = 12;

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: '仅支持 POST' });
    }

    const ip = getClientIp(req);
    if (ipRateLimit(ip, 'ftml-include', 12, 60 * 1000)) {
        return res.status(429).json({ error: 'Include 请求过于频繁，请稍后重试' });
    }

    const source = typeof req.body?.source === 'string' ? req.body.source : '';
    const selectedSite = typeof req.body?.site === 'string' ? req.body.site : '';
    if (!source || source.length > MAX_SOURCE_LENGTH) {
        return res.status(400).json({ error: '源码为空或超过 300,000 字符限制' });
    }
    if (!config.SUPPORT_WIKI.some(site => site.PARAM === selectedSite)) {
        return res.status(400).json({ error: '请选择受支持的站点' });
    }

    const warnings = [];
    const includedPages = [];
    const visited = new Set();
    let includeCount = 0;

    async function expand(input, currentSite, depth) {
        if (depth > MAX_DEPTH) {
            warnings.push('Include 递归深度超过限制');
            return input;
        }

        const matches = [...input.matchAll(INCLUDE_PATTERN)];
        if (matches.length === 0) return input;

        let output = '';
        let cursor = 0;
        for (const match of matches) {
            output += input.slice(cursor, match.index);
            cursor = match.index + match[0].length;

            if (includeCount >= MAX_INCLUDES) {
                warnings.push(`Include 数量超过 ${MAX_INCLUDES} 个，剩余内容未展开`);
                output += match[0];
                continue;
            }

            const directive = parseIncludeDirective(match[1]);
            const target = resolveIncludeTarget(
                directive.page,
                currentSite,
                config.SUPPORT_WIKI
            );
            if (!target) {
                warnings.push(`已阻止不受支持的 Include：${directive.page || '(空)'}`);
                output += match[0];
                continue;
            }

            const visitKey = `${target.site}:${target.page}`;
            if (visited.has(visitKey)) {
                warnings.push(`检测到循环 Include：${visitKey}`);
                output += match[0];
                continue;
            }

            const wikiConfig = config.SUPPORT_WIKI.find(site => site.PARAM === target.site);
            includeCount += 1;
            visited.add(visitKey);
            try {
                const fetched = await fetchWikidotSource(wikiConfig, target.page);
                const substituted = substituteVariables(fetched, directive.variables);
                const expanded = await expand(substituted, target.site, depth + 1);
                output += expanded;
                includedPages.push(visitKey);
            } catch (error) {
                warnings.push(`${visitKey}：${error.message}`);
                output += match[0];
            } finally {
                visited.delete(visitKey);
            }

            if (output.length > MAX_EXPANDED_LENGTH) {
                throw new Error('Include 展开结果超过 500,000 字符限制');
            }
        }
        output += input.slice(cursor);
        return output;
    }

    try {
        const expandedSource = await expand(source, selectedSite, 0);
        return res.status(200).json({
            expandedSource,
            includedPages: [...new Set(includedPages)],
            warnings,
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}

export default withCsrf(handler);
