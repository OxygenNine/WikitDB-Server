// SMTP 连通性测试脚本
// 用法：node --env-file=.env scripts/test-smtp.mjs 收件人邮箱
// 例：node --env-file=.env scripts/test-smtp.mjs test@163.com
// 与 pages/api/send-code.js 使用相同的 SMTP 配置逻辑，验证通过即代表发信功能可正常使用。
import nodemailer from 'nodemailer';

function buildTransporter() {
    const host = (process.env.SMTP_HOST || '').trim();
    const port = parseInt(process.env.SMTP_PORT || '', 10);
    const user = (process.env.SMTP_USER || '').trim();
    const pass = process.env.SMTP_PASS || '';

    if (!host || !port || !user) return null;

    const secure = process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : port === 465;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
    });

    return { transporter, from: (process.env.SMTP_FROM || '').trim() || user };
}

const to = process.argv[2];
if (!to) {
    console.error('用法: node --env-file=.env scripts/test-smtp.mjs 收件人邮箱');
    process.exit(1);
}

const smtp = buildTransporter();
if (!smtp) {
    console.error('SMTP 未配置：请在 .env 中填写 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS');
    process.exit(1);
}

console.log(`SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}  secure=${smtp.transporter.options.secure}  from=${smtp.from}`);

try {
    await smtp.transporter.sendMail({
        from: `"WikitDB" <${smtp.from}>`,
        to,
        subject: '【WikitDB】SMTP 连通性测试',
        html: '<p>这是一封来自 WikitDB 的 SMTP 测试邮件，收到即代表 SMTP 配置正常，注册验证码发信功能可用。</p>',
    });
    console.log('SMTP_TEST_OK - 测试邮件已发送，请查收');
    process.exit(0);
} catch (e) {
    console.error('SMTP 测试失败:', e.message || e);
    process.exit(1);
}
