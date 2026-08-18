import prisma from '../../lib/prisma';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { rateLimit, ipRateLimit, getClientIp } from '../../utils/security';
import { withCsrf } from '../../utils/csrf';

/**
 * 构建 SMTP 发送器。
 * 若 SMTP 未配置（host/port/user 缺失），返回 null，由调用方给出友好提示。
 */
function buildTransporter() {
    const host = (process.env.SMTP_HOST || '').trim();
    const port = parseInt(process.env.SMTP_PORT || '', 10);
    const user = (process.env.SMTP_USER || '').trim();
    const pass = process.env.SMTP_PASS || '';

    if (!host || !port || !user) {
        return null;
    }

    // secure 模式：
    // - 显式配置 SMTP_SECURE=true/false 时优先采用；
    // - 未配置时按端口推断：465 走 SSL（secure=true），其余如 587/25 走 STARTTLS（secure=false）。
    const secure = process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : port === 465;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        // 快速失败，避免长时间挂起阻塞请求
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
    });

    const from = (process.env.SMTP_FROM || '').trim() || user;

    return { transporter, from };
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '请求方法不允许' });
    }

    const { email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: '请提供有效的邮箱地址' });
    }

    try {
        // 提前校验 SMTP 配置，避免无谓的限速/数据库写入
        const smtp = buildTransporter();
        if (!smtp) {
            return res.status(500).json({ error: '发信服务未配置，请管理员在 .env 中填写 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS' });
        }

        const ip = getClientIp(req);
        if (ipRateLimit(ip, 'send-code', 10, 60 * 60 * 1000)) {
            return res.status(429).json({ error: '当前网络发送验证码过于频繁' });
        }

        const existingUser = await prisma.user.findFirst({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: '该邮箱已被注册' });
        }

        // 每日上限：同一邮箱每天最多 5 次
        const dailyLimited = await rateLimit(`sendcode_daily:${email}`, 5, 24 * 60 * 60 * 1000);
        if (dailyLimited) {
            return res.status(429).json({ error: '该邮箱今日发送次数已达上限，请明天再试' });
        }

        // 短期限频：1 分钟内不可重复发送
        const existingCode = await prisma.verificationCode.findUnique({ where: { email } });
        if (existingCode) {
            const timeRemaining = new Date(existingCode.expiresAt).getTime() - Date.now();
            if (timeRemaining > 9 * 60 * 1000) {
                return res.status(429).json({ error: '请求过于频繁，请等待 60 秒后再获取' });
            }
        }

        const code = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.verificationCode.upsert({
            where: { email },
            update: { code, expiresAt },
            create: { email, code, expiresAt },
        });

        await smtp.transporter.sendMail({
            from: `"WikitDB" <${smtp.from}>`,
            to: email,
            subject: '【WikitDB】您的注册验证码',
            html: `
                <div style="padding: 20px; background: #111827; color: #fff; border-radius: 10px;">
                    <h2 style="color: #818cf8;">欢迎注册 WikitDB</h2>
                    <p style="color: #d1d5db;">您的验证码是：<strong style="font-size: 24px; color: #fff;">${code}</strong></p>
                    <p style="color: #9ca3af; font-size: 12px;">该验证码在 10 分钟内有效，请勿泄露给他人。</p>
                </div>
            `,
        });

        return res.status(200).json({ message: '验证码已发送至您的邮箱' });
    } catch (error) {
        console.error('发信异常:', error);
        // 发信失败时清理未送达的验证码记录，避免残留记录干扰下次发送
        if (email) {
            await prisma.verificationCode.delete({ where: { email } }).catch(() => {});
        }
        return res.status(500).json({ error: '发信服务异常，请联系管理员' });
    }
}

export default withCsrf(handler);
