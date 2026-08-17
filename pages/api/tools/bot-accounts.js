import prisma from '../../../lib/prisma';
import { withAuth } from '../../../utils/withAuth';
import { encryptPassword, encryptData } from '../../../utils/botAccountCrypto';

// 密码字段绝不回显
const PUBLIC_SELECT = {
    id: true, name: true, username: true, createdBy: true,
    scanInterval: true, scanSites: true, deleteScore: true, countdownHours: true, lastScanAt: true,
    createdAt: true, updatedAt: true
};

// 解析扫描站点：兼容数组或 JSON 字符串，返回字符串数组
function parseSites(sites) {
    if (Array.isArray(sites)) return sites.map((s) => String(s).trim()).filter(Boolean);
    if (typeof sites === 'string' && sites.trim()) {
        try {
            const arr = JSON.parse(sites);
            if (Array.isArray(arr)) return arr.map((s) => String(s).trim()).filter(Boolean);
        } catch (e) { /* 忽略 */ }
        return sites.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

async function handler(req, res) {
    // GET：列出当前用户创建的机器人
    if (req.method === 'GET') {
        try {
            const bots = await prisma.botAccount.findMany({
                where: { createdBy: req.user.username },
                orderBy: { createdAt: 'desc' },
                select: { ...PUBLIC_SELECT, sessionCookie: true }
            });
            // scanSites 从 JSON 字符串解析为数组返回；sessionCookie 不回显，仅标记是否已配置
            const safe = bots.map((b) => {
                const { sessionCookie, ...rest } = b;
                return {
                    ...rest,
                    hasSession: !!sessionCookie,
                    scanSites: (() => {
                        try { return JSON.parse(b.scanSites || '[]'); } catch { return []; }
                    })()
                };
            });
            return res.status(200).json({ success: true, bots: safe });
        } catch (e) {
            console.error('查询机器人失败:', e.message);
            return res.status(500).json({ error: '查询机器人列表失败' });
        }
    }

    // POST：创建机器人（支持扫描间隔、指定站点、删除线、倒计时时间）
    if (req.method === 'POST') {
        const { name, username, password, scanInterval, scanSites, deleteScore, countdownHours } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写机器人名称' });
        if (!username || !String(username).trim()) return res.status(400).json({ error: '请填写机器人账号' });
        if (!password || String(password).length < 4) return res.status(400).json({ error: '密码过短' });

        const interval = parseInt(scanInterval, 10);
        const sites = parseSites(scanSites);
        const score = parseInt(deleteScore, 10);
        const hours = parseInt(countdownHours, 10);

        try {
            const bot = await prisma.botAccount.create({
                data: {
                    name: String(name).trim().slice(0, 50),
                    username: String(username).trim().slice(0, 100),
                    password: encryptPassword(password),
                    createdBy: req.user.username,
                    scanInterval: interval > 0 ? interval : null,
                    scanSites: sites.length > 0 ? JSON.stringify(sites) : null,
                    deleteScore: Number.isNaN(score) ? null : score,
                    countdownHours: Number.isNaN(hours) || hours <= 0 ? null : hours
                },
                select: PUBLIC_SELECT
            });
            return res.status(201).json({ success: true, bot: { ...bot, scanSites: sites } });
        } catch (e) {
            console.error('创建机器人失败:', e.message);
            return res.status(500).json({ error: '创建机器人失败' });
        }
    }

    // PUT：编辑机器人（名称 / 扫描间隔 / 指定站点 / 删除线 / 倒计时时间 / 会话Cookie），仅创建者可编辑
    if (req.method === 'PUT') {
        const { id, name, scanInterval, scanSites, deleteScore, countdownHours, sessionCookie } = req.body || {};
        const botId = parseInt(id, 10);
        if (!botId) return res.status(400).json({ error: '缺少机器人 ID' });

        try {
            const existing = await prisma.botAccount.findUnique({ where: { id: botId } });
            if (!existing) return res.status(404).json({ error: '机器人不存在' });
            if (existing.createdBy !== req.user.username) {
                return res.status(403).json({ error: '无权编辑他人创建的机器人' });
            }

            const interval = parseInt(scanInterval, 10);
            const sites = parseSites(scanSites);
            const score = parseInt(deleteScore, 10);
            const hours = parseInt(countdownHours, 10);

            const bot = await prisma.botAccount.update({
                where: { id: botId },
                data: {
                    ...(name && String(name).trim() ? { name: String(name).trim().slice(0, 50) } : {}),
                    scanInterval: interval > 0 ? interval : null,
                    scanSites: sites.length > 0 ? JSON.stringify(sites) : null,
                    deleteScore: Number.isNaN(score) ? null : score,
                    countdownHours: Number.isNaN(hours) || hours <= 0 ? null : hours,
                    // 手动会话 Cookie：传入则更新（加密存储），传空字符串则清除
                    ...(typeof sessionCookie === 'string' ? { sessionCookie: sessionCookie.trim() ? encryptData(sessionCookie.trim()) : null } : {})
                },
                select: PUBLIC_SELECT
            });
            return res.status(200).json({ success: true, bot: { ...bot, scanSites: sites } });
        } catch (e) {
            console.error('编辑机器人失败:', e.message);
            return res.status(500).json({ error: '编辑机器人失败' });
        }
    }

    // DELETE：删除机器人（仅限创建者）
    if (req.method === 'DELETE') {
        const { id } = req.body || {};
        const botId = parseInt(id, 10);
        if (!botId) return res.status(400).json({ error: '缺少机器人 ID' });

        try {
            const existing = await prisma.botAccount.findUnique({ where: { id: botId } });
            if (!existing) return res.status(404).json({ error: '机器人不存在' });
            if (existing.createdBy !== req.user.username) {
                return res.status(403).json({ error: '无权删除他人创建的机器人' });
            }
            await prisma.botAccount.delete({ where: { id: botId } });
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('删除机器人失败:', e.message);
            return res.status(500).json({ error: '删除机器人失败' });
        }
    }

    return res.status(405).json({ error: '方法不支持' });
}

export default withAuth(handler);

