import prisma from '../../../lib/prisma';
import { withAuth } from '../../../utils/withAuth';
const config = require('../../../wikitdb.config.js');

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '仅支持 POST' });
    }

    const { site, page, title, source, comments } = req.body;

    if (!site) return res.status(400).json({ error: '请选择站点' });
    if (!page || !String(page).trim()) return res.status(400).json({ error: '请填写页面名称' });
    if (!source || !String(source).trim()) return res.status(400).json({ error: '页面内容不能为空' });

    const wikiConfig = config.SUPPORT_WIKI.find(w => w.PARAM === site);
    if (!wikiConfig) return res.status(400).json({ error: '未找到对应站点配置' });

    const pageName = String(page).trim().slice(0, 200);
    const pageTitle = String(title || '').trim().slice(0, 200);
    const pageSource = String(source);
    const pageComments = String(comments || '').trim().slice(0, 2000) || null;

    try {
        // 创建代发审核单，等待职员在 /staff-panel 审核通过后由机器人发送
        const post = await prisma.proxyPost.create({
            data: {
                userId: req.user.id,
                username: req.user.username,
                site,
                siteName: wikiConfig.NAME || site,
                page: pageName,
                title: pageTitle,
                source: pageSource,
                comments: pageComments,
                status: 'pending'
            }
        });

        return res.status(200).json({
            success: true,
            requestId: post.id,
            message: `已提交审核（单号 #${post.id}），审核通过后由职员登记的机器人代发至 ${wikiConfig.NAME}`
        });
    } catch (error) {
        console.error('Create proxy post error:', error.message);
        return res.status(500).json({ error: '提交审核失败，请稍后重试' });
    }
}

export default withAuth(handler);
