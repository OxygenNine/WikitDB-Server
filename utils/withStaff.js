import { verifyToken } from './auth';
import prisma from '../lib/prisma';
import { validateOrigin } from './csrf';

/** 解析 staffSites（JSON 数组或逗号分隔），返回 PARAM 数组 */
export function parseStaffSites(value) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
        try {
            const arr = JSON.parse(value);
            if (Array.isArray(arr)) return arr.map((s) => String(s).trim()).filter(Boolean);
        } catch (e) { /* 忽略 */ }
        return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * 职员权限包装器
 * 1. 登录校验 (401)
 * 2. 账号状态校验 (403)
 * 3. 职员身份校验 (403)：仅 isStaff = true 的用户可访问
 * 将用户信息（含解析后的 staffSites）挂载到 req.user
 */
export function withStaff(handler) {
    return async (req, res) => {
        try {
            if (!validateOrigin(req)) {
                return res.status(403).json({ error: '请求来源不合法' });
            }

            const decoded = verifyToken(req);
            if (!decoded?.username) {
                return res.status(401).json({ error: '会话已过期，请重新登录' });
            }

            const user = await prisma.user.findUnique({
                where: { username: decoded.username }
            });

            if (!user) return res.status(401).json({ error: '账号不存在' });
            if (user.status !== 'active') return res.status(403).json({ error: '账号已被封禁，无法执行该操作' });
            if (!user.isStaff && !user.isAdmin) return res.status(403).json({ error: '无权访问职员面板' });

            // 管理员天然拥有全部站点审核权
            req.user = {
                ...user,
                staffSites: user.isAdmin ? [] : parseStaffSites(user.staffSites),
                isAdmin: !!user.isAdmin
            };

            return await handler(req, res);
        } catch (error) {
            console.error('Staff Middleware Error:', error);
            return res.status(500).json({ error: '系统身份验证异常' });
        }
    };
}
