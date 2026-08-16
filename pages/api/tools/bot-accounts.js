import prisma from '../../../lib/prisma';
import { withAuth } from '../../../utils/withAuth';
import { encryptPassword } from '../../../utils/botAccountCrypto';

// 密码字段绝不回显
const PUBLIC_SELECT = { id: true, name: true, username: true, createdBy: true, createdAt: true, updatedAt: true };

async function handler(req, res) {
    // GET：列出当前用户创建的机器人
    if (req.method === 'GET') {
        try {
            const bots = await prisma.botAccount.findMany({
                where: { createdBy: req.user.username },
                orderBy: { createdAt: 'desc' },
                select: PUBLIC_SELECT
            });
            return res.status(200).json({ success: true, bots });
        } catch (e) {
            console.error('查询机器人失败:', e.message);
            return res.status(500).json({ error: '查询机器人列表失败' });
        }
    }

    // POST：创建机器人
    if (req.method === 'POST') {
        const { name, username, password } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写机器人名称' });
        if (!username || !String(username).trim()) return res.status(400).json({ error: '请填写机器人账号' });
        if (!password || String(password).length < 4) return res.status(400).json({ error: '密码过短' });

        try {
            const bot = await prisma.botAccount.create({
                data: {
                    name: String(name).trim().slice(0, 50),
                    username: String(username).trim().slice(0, 100),
                    password: encryptPassword(password),
                    createdBy: req.user.username
                },
                select: PUBLIC_SELECT
            });
            return res.status(201).json({ success: true, bot });
        } catch (e) {
            console.error('创建机器人失败:', e.message);
            return res.status(500).json({ error: '创建机器人失败' });
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
