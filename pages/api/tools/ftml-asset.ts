import { getClientIp, ipRateLimit } from '../../../utils/security';
import type { NextApiRequest, NextApiResponse } from 'next';
const { isAllowedFtmlAssetUrl, rewriteFtmlCss } = require('../../../utils/ftmlAssetProxy');

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;

async function fetchAllowed(url: string): Promise<Response> {
    let current = url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        if (!isAllowedFtmlAssetUrl(current)) throw new Error('disallowed asset');
        const response = await fetch(current, {
            redirect: 'manual',
            headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; WikitDB-FTML-Preview/1.0)' },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get('location');
        if (!location) throw new Error('redirect without location');
        current = new URL(location, current).href;
    }
    throw new Error('too many redirects');
}

async function readLimited(response: Response): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_RESPONSE_SIZE) throw new Error('asset too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_RESPONSE_SIZE) throw new Error('asset too large');
    return buffer;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).send('Method Not Allowed');
    }
    if (ipRateLimit(getClientIp(req), 'ftml-asset', 120, 60 * 1000)) return res.status(429).send('Too Many Requests');
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!isAllowedFtmlAssetUrl(url)) return res.status(400).send('Disallowed asset URL');

    try {
        const response = await fetchAllowed(url);
        if (!response.ok) return res.status(502).send('Upstream asset request failed');
        const finalUrl = response.url || url;
        if (!isAllowedFtmlAssetUrl(finalUrl)) return res.status(502).send('Invalid upstream URL');
        const body = await readLimited(response);
        const contentType = String(response.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (/text\/css|\/css/i.test(contentType)) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            return res.status(200).send(rewriteFtmlCss(body.toString('utf8'), finalUrl));
        }
        if (/text\/html/i.test(contentType)) return res.status(502).send('HTML assets are not allowed');
        res.setHeader('Content-Type', contentType);
        return res.status(200).send(body);
    } catch {
        return res.status(502).send('Asset proxy failed');
    }
}
