import { serialize } from 'cookie';
import { validateOrigin } from '../../utils/csrf';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!validateOrigin(req)) {
        return res.status(403).json({ error: '请求来源不合法' });
    }
    // 清除 cookie 需与登录时保持一致（HTTP 站点不设 Secure，否则浏览器不会删除）
    const isHttps = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    res.setHeader('Set-Cookie', serialize('auth_token', '', {
        maxAge: -1,
        path: '/',
        httpOnly: true,
        secure: isHttps,
        sameSite: 'strict',
    }));
    res.status(200).json({ success: true });
}
