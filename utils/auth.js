import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET must contain at least 32 characters.');
}

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
};

export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '7d'
    });
}

export function verifyToken(req) {
    const cookies = parse(req.headers.cookie || '');
    let token = cookies.auth_token;
    // 兜底：Authorization: Bearer <token>（HTTP 场景 secure cookie 被拒收时使用）
    if (!token && req.headers.authorization) {
        const h = req.headers.authorization;
        if (typeof h === 'string' && h.startsWith('Bearer ')) {
            token = h.substring(7).trim();
        }
    }
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
        return null;
    }
}

export function serializeAuthCookie(token) {
    return serialize('auth_token', token, COOKIE_OPTIONS);
}
