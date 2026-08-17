import prisma from '../../../lib/prisma';
import { withStaff } from '../../../utils/withStaff';
import { decryptPassword } from '../../../utils/botAccountCrypto';
import { login, clearLoginCache, sleep, savePage } from '../../../utils/wikidotStaffActions';
const config = require('../../../wikitdb.config.js');

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

/** 校验当前用户是否有权审核某站点 */
function canReviewSite(req, siteParam) {
    return req.user.isAdmin || req.user.staffSites.includes(siteParam);
}

async function handler(req, res) {
    // GET：列出审核单（职员仅看自己负责的站点，管理员看全部）+ 可用机器人
    if (req.method === 'GET') {
        try {
            const { status } = req.query;
            const where = {};
            if (status) where.status = String(status);
            if (!req.user.isAdmin) {
                where.site = { in: req.user.staffSites };
            }

            const posts = await prisma.proxyPost.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 200
            });

            // 可用机器人：所有职员登记的机器人（含解析后的 scanSites），供前端按站点过滤
            const staffUsernames = (await prisma.user.findMany({
                where: { isStaff: true },
                select: { username: true }
            })).map(u => u.username);

            const bots = await prisma.botAccount.findMany({
                orderBy: { name: 'asc' }
            });
            const usableBots = bots
                .filter(b => staffUsernames.includes(b.createdBy) || req.user.isAdmin)
                .map(b => ({
                    id: b.id,
                    name: b.name,
                    username: b.username,
                    createdBy: b.createdBy,
                    hasSession: !!b.sessionCookie,
                    scanSites: parseSites(b.scanSites)
                }));

            return res.status(200).json({ success: true, posts, bots: usableBots, staffSites: req.user.staffSites });
        } catch (e) {
            console.error('[proxy-posts] 读取失败:', e.message);
            return res.status(500).json({ error: '读取审核单失败' });
        }
    }

    // POST：approve（通过并发送）/ send（补发或重试）/ reject（拒绝）
    if (req.method === 'POST') {
        const { id, action, botAccountId, note } = req.body || {};
        const postId = parseInt(id, 10);
        if (!postId || !['approve', 'send', 'reject'].includes(action)) {
            return res.status(400).json({ error: '参数不完整或操作类型未知' });
        }

        try {
            const post = await prisma.proxyPost.findUnique({ where: { id: postId } });
            if (!post) return res.status(404).json({ error: '审核单不存在' });

            if (!canReviewSite(req, post.site)) {
                return res.status(403).json({ error: `您不负责站点「${post.siteName || post.site}」，无权审核该请求` });
            }

            if (action === 'reject') {
                if (!['pending', 'approved'].includes(post.status)) {
                    return res.status(400).json({ error: '该审核单已处理，无法拒绝' });
                }
                const updated = await prisma.proxyPost.update({
                    where: { id: postId },
                    data: {
                        status: 'rejected',
                        reviewNote: String(note || '').trim().slice(0, 2000) || null,
                        reviewedBy: req.user.username,
                        reviewedAt: new Date()
                    }
                });
                return res.status(200).json({ success: true, message: `已拒绝 #${postId}`, post: updated });
            }

            if (action === 'approve' || action === 'send') {
                if (action === 'approve' && post.status !== 'pending') {
                    return res.status(400).json({ error: '该审核单已处理，请使用「重新发送」' });
                }
                if (action === 'send' && !['approved', 'failed'].includes(post.status)) {
                    return res.status(400).json({ error: '当前状态不可发送' });
                }

                const botId = parseInt(botAccountId, 10);
                if (!botId) return res.status(400).json({ error: '请选择要使用的机器人账号' });

                const bot = await prisma.botAccount.findUnique({ where: { id: botId } });
                if (!bot) return res.status(404).json({ error: '机器人账号不存在' });

                // 仅允许使用职员登记的机器人（管理员可用任意机器人）
                const staffUsernames = (await prisma.user.findMany({
                    where: { isStaff: true },
                    select: { username: true }
                })).map(u => u.username);
                if (!req.user.isAdmin && !staffUsernames.includes(bot.createdBy)) {
                    return res.status(403).json({ error: '只能使用职员登记的机器人发送' });
                }

                const siteConfig = config.SUPPORT_WIKI.find(w => w.PARAM === post.site);
                if (!siteConfig) return res.status(400).json({ error: '目标站点配置不存在，无法发送' });

                const baseUrl = siteConfig.URL.replace(/\/$/, '');
                const botLabel = `${bot.name} (${bot.username})`;

                await prisma.proxyPost.update({
                    where: { id: postId },
                    data: {
                        status: 'approved',
                        reviewNote: action === 'approve' ? String(note || '').trim().slice(0, 2000) || null : post.reviewNote,
                        reviewedBy: action === 'approve' ? req.user.username : post.reviewedBy || req.user.username,
                        reviewedAt: new Date(),
                        botAccountId: botId,
                        botLabel
                    }
                });

                try {
                    const password = decryptPassword(bot.password);
                    const attemptSend = async () => {
                        const cookie = await login(bot.username, password);
                        return savePage(baseUrl, post.page, cookie, {
                            title: post.title,
                            source: post.source,
                            comments: post.comments
                        });
                    };

                    let result;
                    try {
                        result = await attemptSend();
                    } catch (firstErr) {
                        // 会话可能因缓存过期失效，清缓存重登后重试一次
                        clearLoginCache();
                        await sleep(3000);
                        result = await attemptSend();
                    }

                    const updated = await prisma.proxyPost.update({
                        where: { id: postId },
                        data: {
                            status: 'sent',
                            sentAt: new Date(),
                            sendResult: JSON.stringify({ ok: true, httpStatus: result.httpStatus, pageUrl: result.pageUrl, bot: botLabel })
                        }
                    });
                    return res.status(200).json({ success: true, message: `已通过并由机器人 ${botLabel} 发送成功`, post: updated });
                } catch (e) {
                    const updated = await prisma.proxyPost.update({
                        where: { id: postId },
                        data: {
                            status: 'failed',
                            sendResult: JSON.stringify({ ok: false, error: e.message, bot: botLabel })
                        }
                    });
                    return res.status(200).json({
                        success: false,
                        message: `发送失败：${e.message}（审核已通过，可在面板中重新发送）`,
                        post: updated
                    });
                }
            }

            return res.status(400).json({ error: '未知操作' });
        } catch (e) {
            console.error('[proxy-posts] 处理失败:', e.message);
            return res.status(500).json({ error: '处理审核单失败' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaff(handler);
