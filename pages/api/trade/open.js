import prisma from '../../../lib/prisma';
import { withAuth } from '../../../utils/withAuth';
import { validateNumberRange } from '../../../utils/security';
import { debitBalance } from '../../../utils/balance';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const user = req.user;
    const { target, amount, type } = req.body;

    if (typeof target !== 'string' || !target.trim() || target.length > 200) {
        return res.status(400).json({ error: '无效的交易目标' });
    }
    if (type !== undefined && !['BUY', 'SELL'].includes(type)) {
        return res.status(400).json({ error: '无效的交易类型' });
    }

    const safeAmount = validateNumberRange(amount, 1, 100000);
    if (safeAmount === null) return res.status(400).json({ error: '交易金额异常（范围 1-100000）' });

    try {
        const result = await prisma.$transaction(async (tx) => {
            const updatedUser = await debitBalance(tx, user.id, safeAmount);

            const trade = await tx.trade.create({
                data: {
                    userId: user.id,
                    type: type || 'BUY',
                    amount: safeAmount,
                    target: target.trim(),
                    status: 'COMPLETED',
                    description: `交易目标: ${target.trim()}`
                }
            });

            return { balance: updatedUser.balance, tradeId: trade.id };
        });

        return res.status(200).json({
            message: '交易成功',
            newBalance: result.balance,
            tradeId: result.tradeId
        });

    } catch (error) {
        console.error('Trade critical failure:', error.message);
        return res.status(400).json({ error: error.message || '交易处理失败' });
    }
}

export default withAuth(handler);
