/**
 * 机器人账号密码加解密（AES-256-GCM）
 * 密钥派生自 JWT_SECRET，保证仅本站可解密；数据库中以密文存储，列表接口不回显明文。
 */
const crypto = require('crypto');

const FALLBACK_SECRET = 'wikitdb-bot-account-fallback-key-do-not-use-in-prod';

function getKey() {
    return crypto.createHash('sha256')
        .update(process.env.JWT_SECRET || FALLBACK_SECRET)
        .digest();
}

/** 加密明文密码，返回 JSON 字符串 { iv, tag, data } */
function encryptPassword(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: data.toString('base64')
    });
}

/** 解密密文，返回明文密码 */
function decryptPassword(encrypted) {
    try {
        const { iv, tag, data } = JSON.parse(String(encrypted || ''));
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([
            decipher.update(Buffer.from(data, 'base64')),
            decipher.final()
        ]).toString('utf8');
    } catch (e) {
        throw new Error('机器人密码解密失败');
    }
}

module.exports = { encryptPassword, decryptPassword };
