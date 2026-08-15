import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
const config = require('../../wikitdb.config.js');
const {
    buildTimerIframe,
    buildAnnouncementText,
    buildAnnouncementTitle,
    parsePageName
} = require('../../utils/staffPostDeletion');

const StaffPostDeletion = () => {
    const wikis = config.SUPPORT_WIKI || [];
    const [site, setSite] = useState('');
    const [botUsername, setBotUsername] = useState('');
    const [botPassword, setBotPassword] = useState('');
    const [deleteScore, setDeleteScore] = useState(-5);
    const [countdownHours, setCountdownHours] = useState(72);
    const [tagName, setTagName] = useState('待删除');
    const [pagesText, setPagesText] = useState('');
    const [timerIframe, setTimerIframe] = useState('');
    const [announcementText, setAnnouncementText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);

    const timerBaseUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/timer/timer.html`
        : '';

    // 根据「删除线」和「倒计时时间」重新生成计时器代码（基于 D:\scp\timer）
    const regenerateTimer = useCallback(() => {
        const iframe = buildTimerIframe(timerBaseUrl, {
            deleteScore,
            countdownHours
        });
        setTimerIframe(iframe);
        // 同步刷新公告预览（若用户尚未手动改过公告模板）
        setAnnouncementText(buildAnnouncementText({
            deleteScore,
            timerIframe: iframe
        }));
    }, [timerBaseUrl, deleteScore, countdownHours]);

    const fillDefaultTemplate = () => {
        setAnnouncementText(buildAnnouncementText({
            deleteScore,
            timerIframe: timerIframe || buildTimerIframe(timerBaseUrl, { deleteScore, countdownHours })
        }));
    };

    const pageList = pagesText.split('\n').map((l) => l.trim()).filter(Boolean);

    const handleSubmit = async () => {
        setError('');
        setResults(null);
        if (!site) return setError('请选择站点');
        if (!botUsername || !botPassword) return setError('请填写机器人账号和密码（留空则使用服务器默认 Bot 配置）');
        if (pageList.length === 0) return setError('请至少输入一个页面');
        if (!timerIframe.trim()) return setError('请先生成计时器代码');

        setLoading(true);
        try {
            const res = await fetch('/api/tools/staff-post-deletion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site,
                    pages: pageList,
                    botUsername,
                    botPassword,
                    deleteScore,
                    countdownHours,
                    tagName,
                    timerBaseUrl,
                    customTimerIframe: timerIframe,
                    announcementText
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '操作失败');
            setResults(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>删帖公示操作 - {config.SITE_NAME}</title>
            </Head>
            <div className="py-8 max-w-4xl mx-auto">
                <div className="mb-6 border-b border-gray-700 pb-4 flex items-center gap-4">
                    <Link href="/tools" className="text-gray-400 hover:text-white transition-colors">
                        <i className="fa-solid fa-arrow-left"></i> 返回
                    </Link>
                    <h1 className="text-2xl font-bold text-white">删帖公示操作</h1>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">staff-post-deletion</span>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400 text-sm">
                        <i className="fa-solid fa-circle-exclamation mr-2"></i>{error}
                    </div>
                )}

                <div className="bg-gray-800/50 rounded-xl p-6 border border-white/10 space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">目标站点</label>
                        <select value={site} onChange={(e) => setSite(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5">
                            <option value="">选择站点...</option>
                            {wikis.map((w) => (
                                <option key={w.PARAM} value={w.PARAM}>{w.NAME} ({w.WIKIT_ID})</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">机器人账号</label>
                            <input type="text" value={botUsername} onChange={(e) => setBotUsername(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                                placeholder="Wikidot 机器人账号（留空用服务器 Bot）" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">机器人密码</label>
                            <input type="password" value={botPassword} onChange={(e) => setBotPassword(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                                placeholder="Wikidot 机器人密码（留空用服务器 Bot）" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">删除线（分数阈值）</label>
                            <input type="number" value={deleteScore} onChange={(e) => setDeleteScore(parseInt(e.target.value, 10) || 0)}
                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                                placeholder="-5" />
                            <p className="text-xs text-gray-500 mt-1">评分低于/等于该分数线即宣告删除</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">计时器倒计时时间（小时）</label>
                            <input type="number" min="1" value={countdownHours} onChange={(e) => setCountdownHours(parseInt(e.target.value, 10) || 72)}
                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                                placeholder="72" />
                            <p className="text-xs text-gray-500 mt-1">公告中的删除倒计时时长</p>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-300">计时器代码</label>
                            <button type="button" onClick={regenerateTimer}
                                className="px-3 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded hover:bg-indigo-600/30 transition-colors text-xs">
                                <i className="fa-solid fa-rotate mr-1"></i>重新生成
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">计时器代码在此处使用：<code className="text-indigo-400 bg-gray-900 px-1.5 py-0.5 rounded">D:\scp\timer</code>（SCP Wiki 删除计时器）</p>
                        <textarea value={timerIframe} onChange={(e) => setTimerIframe(e.target.value)} rows={3}
                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5 font-mono"
                            placeholder="点击「重新生成」生成 [[iframe ...]] 计时器代码，或手动粘贴自定义代码" />
                    </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-6 border border-white/10 space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">待处理页面（每行一个页面名或完整 URL）</label>
                        <textarea value={pagesText} onChange={(e) => setPagesText(e.target.value)} rows={6}
                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5 font-mono"
                            placeholder={'例如：\nscp-001\nhttps://deep-forest-club.wikidot.com/scp-002'} />
                        {pageList.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">已解析 {pageList.length} 个页面</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">待添加标签</label>
                        <input type="text" value={tagName} onChange={(e) => setTagName(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                            placeholder="待删除" />
                    </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-6 border border-white/10 space-y-4 mb-6">
                    <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-300">公告内容（可编辑，发帖时逐页面套用）</label>
                        <button type="button" onClick={fillDefaultTemplate}
                            className="px-3 py-1 bg-green-600/20 text-green-400 border border-green-500/30 rounded hover:bg-green-600/30 transition-colors text-xs">
                            <i className="fa-solid fa-file-lines mr-1"></i>填充默认模板
                        </button>
                    </div>
                    <textarea value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} rows={8}
                        className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5 font-mono"
                        placeholder="公告模板（含 [[iframe]] 计时器代码）..." />
                    <p className="text-xs text-gray-500">新主题标题固定为「职员帖：删除宣告」，内容使用计时器代码自动生成的删文帖格式。</p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleSubmit} disabled={loading}
                        className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50">
                        {loading ? (
                            <><i className="fa-solid fa-spinner fa-spin mr-2"></i>执行中...</>
                        ) : (
                            <><i className="fa-solid fa-bullhorn mr-2"></i>执行：添加标签 + 发布删帖公告</>
                        )}
                    </button>
                    {results && (
                        <span className="text-sm text-gray-400">
                            成功 <span className="text-green-400 font-bold">{results.ok}</span>，失败 <span className="text-red-400 font-bold">{results.fail}</span>
                        </span>
                    )}
                </div>

                {results && results.results && (
                    <div className="mt-6 bg-gray-800/50 rounded-xl p-6 border border-white/10">
                        <h2 className="text-lg font-bold text-white mb-4">执行结果</h2>
                        <div className="space-y-2">
                            {results.results.map((r, idx) => (
                                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${r.status === 'success' ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                                    <i className={`mt-0.5 ${r.status === 'success' ? 'fa-solid fa-circle-check text-green-400' : 'fa-solid fa-circle-xmark text-red-400'}`}></i>
                                    <div className="flex-1">
                                        <div className="text-gray-200 font-medium">{r.page}</div>
                                        {r.status === 'success' ? (
                                            <div className="text-gray-400 text-xs mt-0.5">
                                                已添加标签「{r.tag}」→ 标签列表: {(r.tags || []).join(', ')}；公告已发布到 {r.target}（HTTP {r.httpStatus}）
                                            </div>
                                        ) : (
                                            <div className="text-red-400 text-xs mt-0.5">{r.message}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default StaffPostDeletion;

