import prisma from '../../lib/prisma';

// DB 探活超时（毫秒）— 避免因 DB 慢导致健康检查本身拖垮监控
const DB_TIMEOUT_MS = 3000;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), ms)
        )
    ]);
}

export default async function handler(req, res) {
    // 仅允许 GET，符合 REST 语义且避免被误用为写接口
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 健康检查响应禁止缓存，确保监控 always 拿到实时状态
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const timestamp = new Date().toISOString();
    const uptimeSeconds = Math.floor(process.uptime());

    // DB 探活：SELECT 1 是最轻量的存活检查
    let dbStatus = 'connected';
    let dbLatencyMs = 0;
    try {
        const start = Date.now();
        await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
        dbLatencyMs = Date.now() - start;
    } catch (err) {
        dbStatus = 'error';
    }

    const isHealthy = dbStatus === 'connected';

    return res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'degraded',
        timestamp,
        uptime: uptimeSeconds,
        checks: {
            database: {
                status: dbStatus,
                latencyMs: dbLatencyMs,
            },
        },
    });
}
