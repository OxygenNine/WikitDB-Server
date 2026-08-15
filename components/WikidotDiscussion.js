import React, { useState, useEffect } from 'react';

const PostItem = ({ post }) => {
    return (
        <div className="mt-4 first:mt-0">
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3 border-b border-gray-700/50 pb-2">
                    <img 
                        src={post.avatarUrl} 
                        alt="avatar" 
                        className="w-8 h-8 rounded border border-gray-600 object-cover"
                        onError={(e) => { e.target.src = 'https://www.wikidot.com/avatar.php?account=default'; }}
                    />
                    <div>
                        <div className="text-sm font-bold text-gray-200">{post.author}</div>
                        <div className="text-xs text-gray-500">{post.timestamp}</div>
                    </div>
                </div>
                
                <div 
                    className="text-gray-300 text-sm leading-relaxed prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: post.contentHtml }}
                ></div>
            </div>

            {post.children && post.children.length > 0 && (
                <div className="pl-4 sm:pl-8 mt-2 border-l-2 border-gray-700/50">
                    {post.children.map(child => (
                        <PostItem key={child.postId} post={child} />
                    ))}
                </div>
            )}
        </div>
    );
};

const WikidotDiscussion = ({ wiki, pageId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [anonContent, setAnonContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState('');
    // RSS 更新相关状态
    const [rssData, setRssData] = useState(null);
    const [rssLoading, setRssLoading] = useState(false);
    const [rssError, setRssError] = useState('');
    const [showRss, setShowRss] = useState(true);


    useEffect(() => {
        if (!wiki || !pageId) return;

        const fetchDiscussion = async () => {
            try {
                const res = await fetch(`/api/wikidot-forum?wiki=${wiki}&pageId=${pageId}`);
                const json = await res.json();
                
                if (!res.ok) throw new Error(json.error || '请求失败');
                setData(json);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDiscussion();
    }, [wiki, pageId]);
    // 抓取页面单页讨论的 RSS（页面 HTML → option 栏 → 讨论区 id → feed/forum/t-{id}.xml）
    useEffect(() => {
        if (!wiki || !pageId) return;

        const fetchRss = async () => {
            setRssLoading(true);
            setRssError('');
            try {
                const res = await fetch(`/api/page/discussion-rss?wiki=${wiki}&page=${encodeURIComponent(pageId)}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'RSS 获取失败');
                setRssData(json);
            } catch (err) {
                setRssError(err.message);
            } finally {
                setRssLoading(false);
            }
        };

        fetchRss();
    }, [wiki, pageId]);

    const handleAnonSubmit = async () => {
        if (!anonContent.trim() || !data || !data.threadId) return;
        setIsSubmitting(true);
        setSubmitMsg('');

        try {
            const username = localStorage.getItem('username');
            if (!username) {
                setSubmitMsg('未检测到本地登录凭证，请先登录');
                setIsSubmitting(false);
                return;
            }

            const res = await fetch('/api/anon-reply', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // 强制携带 Cookie
                body: JSON.stringify({
                    username: username,
                    wiki: wiki,
                    threadId: data.threadId,
                    content: anonContent
                })
            });

            const resData = await res.json();
            if (res.ok) {
                setSubmitMsg('代理发送成功，内容可能需要等待下次刷新才能在本地看到。');
                setAnonContent('');
            } else {
                setSubmitMsg(resData.error || '投递失败');
            }
        } catch (err) {
            setSubmitMsg('网络连接异常');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!wiki || !pageId) return null;

    return (
        <div className="w-full mt-12 pt-8 border-t border-gray-800">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <i className="fa-brands fa-wikipedia-w text-gray-400"></i> 原站讨论区
                    {data && <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded-full border border-indigo-700/50">{data.total} 条记录</span>}
                </h3>
                {data && data.url && (
                    <a 
                        href={data.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                        去原站查看 <i className="fa-solid fa-arrow-up-right-from-square ml-1"></i>
                    </a>
                )}
            </div>

            {loading && <div className="text-center py-10 text-gray-500 animate-pulse">正在加载讨论数据...</div>}
            
            {error && (
                <div className="text-center py-8 bg-red-900/20 text-red-400 border border-red-900/50 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {data && data.threads && data.threads.length === 0 && (
                <div className="text-center py-10 text-gray-600 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
                    这篇文档目前在原站没有任何人评论。
                </div>
            )}

            {data && data.threads && data.threads.length > 0 && (
                <div className="space-y-4 mb-8">
                    {data.threads.map(post => (
                        <PostItem key={post.postId} post={post} />
                    ))}
                </div>
            )}


            {/* RSS 更新区块：页面单页讨论 RSS（option 栏讨论区 id → feed/forum/t-{id}.xml） */}
            <div className="mb-6 bg-gray-900/30 rounded-xl border border-gray-700/40 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        onClick={() => setShowRss(!showRss)}
                        className="flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-white transition-colors"
                    >
                        <i className={`fa-solid fa-rss text-orange-400 ${showRss ? '' : 'opacity-60'}`}></i>
                        RSS 更新
                        {rssData && rssData.rss && rssData.rss.items.length > 0 && (
                            <span className="text-xs bg-orange-900/40 text-orange-300 px-2 py-0.5 rounded-full border border-orange-700/40">
                                {rssData.rss.items.length}
                            </span>
                        )}
                        <i className={`fa-solid fa-chevron-${showRss ? 'up' : 'down'} text-xs text-gray-500 transition-transform`}></i>
                    </button>
                    <div className="flex items-center gap-3">
                        {rssLoading && <span className="text-xs text-gray-500 animate-pulse">加载中...</span>}
                        {rssData && rssData.rssUrl && (
                            <a
                                href={rssData.rssUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                                title={rssData.rssUrl}
                            >
                                订阅此讨论 <i className="fa-solid fa-arrow-up-right-from-square ml-1"></i>
                            </a>
                        )}
                    </div>
                </div>

                {showRss && (
                    <div className="px-4 pb-4">
                        {rssLoading && <div className="text-sm text-gray-500 animate-pulse py-4">正在加载 RSS 更新...</div>}

                        {rssError && (
                            <div className="text-sm text-red-400 py-3">{rssError}</div>
                        )}

                        {rssData && rssData.hasDiscussion === false && (
                            <div className="text-sm text-gray-600 py-3">
                                该页面在原站没有启用讨论区，无 RSS 可订阅。
                            </div>
                        )}

                        {rssData && rssData.rss && rssData.rss.items.length === 0 && (
                            <div className="text-sm text-gray-600 py-3">RSS 源暂无更新。</div>
                        )}

                        {rssData && rssData.rss && rssData.rss.items.length > 0 && (
                            <div className="space-y-3">
                                {rssData.rss.items.map(item => (
                                    <div key={item.guid || item.postId} className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-indigo-300 flex items-center gap-2">
                                                <i className="fa-solid fa-user text-xs opacity-60"></i>
                                                {item.authorName || '匿名'}
                                            </span>
                                            <span className="text-xs text-gray-500 whitespace-nowrap">{item.pubDate}</span>
                                        </div>
                                        <div
                                            className="text-gray-300 text-sm mt-2 prose prose-invert max-w-none leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: item.contentHtml }}
                                        ></div>
                                        {item.link && (
                                            <a
                                                href={item.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-block mt-2 text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                                            >
                                                查看原帖 <i className="fa-solid fa-arrow-up-right-from-square ml-1"></i>
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {data && data.threadId && (
                <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-700 mt-6">
                    <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                        发送代理回复
                        <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded">消耗 100 余额</span>
                    </h4>
                    <textarea
                        value={anonContent}
                        onChange={(e) => setAnonContent(e.target.value)}
                        placeholder="想说点什么？所有回复将通过系统账号发送至原站，并附带您的实名标记以确保合规。"
                        className="w-full bg-gray-800/80 border border-gray-600 text-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500 resize-none h-24 text-sm"
                        disabled={isSubmitting}
                    />
                    <div className="flex justify-between items-center mt-3">
                        <span className={`text-sm ${submitMsg.includes('成功') ? 'text-green-400' : 'text-red-400'}`}>
                            {submitMsg}
                        </span>
                        <button
                            onClick={handleAnonSubmit}
                            disabled={!anonContent.trim() || isSubmitting}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            {isSubmitting ? '正在投递...' : '提交回复'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WikidotDiscussion;