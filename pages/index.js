// pages/index.js
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
const config = require('../wikitdb.config.js');

// 兜底占位 SVG（Data URL）：用于 wiki logo 加载失败时回退
const PLACEHOLDER_SVG =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%234f46e5'/><stop offset='1' stop-color='%237c3aed'/></linearGradient></defs><rect width='64' height='64' rx='14' fill='url(%23g)'/><text x='50%25' y='56%25' text-anchor='middle' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='white' dominant-baseline='middle'>W</text></svg>";

const features = [
    {
        icon: 'fa-database',
        color: 'from-indigo-500/20 to-indigo-600/5',
        border: 'hover:border-indigo-500/40',
        iconColor: 'text-indigo-400',
        glow: 'group-hover:shadow-indigo-500/10',
        title: '页面归档',
        desc: '各分站的页面数据实时同步过来，想按标签搜、按评分排、按时间筛都行。',
        href: '/pages',
        cta: '去检索'
    },
    {
        icon: 'fa-chart-line',
        color: 'from-emerald-500/20 to-emerald-600/5',
        border: 'hover:border-emerald-500/40',
        iconColor: 'text-emerald-400',
        glow: 'group-hover:shadow-emerald-500/10',
        title: '作者追踪',
        desc: '看某个作者写了什么、评分走势怎么样、在哪些站活跃，一目了然。',
        href: '/authors',
        cta: '查作者'
    },
    {
        icon: 'fa-toolbox',
        color: 'from-amber-500/20 to-amber-600/5',
        border: 'hover:border-amber-500/40',
        iconColor: 'text-amber-400',
        glow: 'group-hover:shadow-amber-500/10',
        title: '实用工具',
        desc: '盲盒抽取、删除公告生成、质量评审……一些能省事的自动化小玩意。',
        href: '/tools',
        cta: '看工具'
    }
];

const stats = (wikiCount) => [
    { num: `${wikiCount}`, label: '收录站点', icon: 'fa-globe', color: 'text-indigo-400' },
    { num: '实时', label: '数据同步', icon: 'fa-bolt', color: 'text-emerald-400' },
    { num: '多维', label: '搜索筛选', icon: 'fa-filter', color: 'text-amber-400' },
    { num: '免费', label: '开放使用', icon: 'fa-heart', color: 'text-pink-400' }
];

const tools = [
    { icon: 'fa-dice', text: '盲盒抽取', href: '/tools/gacha', color: 'text-purple-400' },
    { icon: 'fa-scroll', text: '删除公告', href: '/tools/jackpot', color: 'text-rose-400' },
    { icon: 'fa-bullseye', text: '悬赏活动', href: '/tools/bounty', color: 'text-emerald-400' },
    { icon: 'fa-users-line', text: '成员管理', href: '/tools/member-admin', color: 'text-sky-400' },
    { icon: 'fa-swords', text: '乱斗竞猜', href: '/tools/deathmatch', color: 'text-orange-400' },
    { icon: 'fa-star', text: '宾果活动', href: '/tools/bingo', color: 'text-yellow-400' }
];

const quickLinks = [
    { text: '浏览所有页面', href: '/pages', icon: 'fa-book-open' },
    { text: '论坛话题', href: '/forums', icon: 'fa-comments' },
    { text: '虚拟股市', href: '/trade', icon: 'fa-money-bill-trend-up' },
    { text: '查看关于页', href: '/about', icon: 'fa-circle-info' }
];

const faqs = [
    {
        q: '这个网站是用来做什么的？',
        a: 'WikitDB 把散落在各个 Wikidot 分站的页面、作者、评分和论坛数据统一整理，让你可以在一个地方跨站搜索页面、追踪作者动态、参与虚拟股市等。'
    },
    {
        q: '使用所有功能都需要账号吗？',
        a: '检索、浏览页面和论坛不需要登录。作者追踪、虚拟股市、高级筛选等个性化功能需要免费注册账号，注册过程不超过一分钟。'
    },
    {
        q: '数据来源是什么？更新及时吗？',
        a: '数据来自 Wikit API，由其调用 kakushi-w/wikit CLI 定期抓取 Wikidot 平台公开页面。每天 12:00（Asia/Shanghai）自动执行备份任务，接口层面会尽可能快地反映最新内容。'
    },
    {
        q: '我是作者，不希望我的作品被收录？',
        a: '请通过社区渠道联系管理员，核验身份后我们会对特定条目进行遮蔽。WikitDB 只是为读者服务的索引工具，原站点永远是权威发布渠道。'
    }
];

const Home = () => {
    const router = useRouter();
    const wikis = config.SUPPORT_WIKI || config.SUPPOST_WIKI || [];
    const [q, setQ] = useState('');

    const onSearch = (e) => {
        e.preventDefault();
        const val = String(q || '').trim();
        if (!val) {
            router.push('/pages');
        } else {
            router.push(`/pages?q=${encodeURIComponent(val)}`);
        }
    };

    // 当 logo 加载失败时回退到占位 SVG（React 里用 non-React event listener）
    const imgFallback = (e) => {
        const target = e.currentTarget;
        if (target.src !== PLACEHOLDER_SVG) target.src = PLACEHOLDER_SVG;
    };

    return (
        <div className="pb-24">
            <Head>
                <title>{`主页 - ${config.SITE_NAME}`}</title>
                <meta
                    name="description"
                    content={`${config.SITE_NAME} 是 Wikidot 社区的数据归档站，收录 ${wikis.length} 个站点。搜页面、查作者、看走势，所有内容一站搞定。`}
                />
                <meta property="og:title" content={`${config.SITE_NAME} · Wikidot 社区的数据归档站`} />
                <meta
                    property="og:description"
                    content="收录多个 Wikidot 分站，支持跨站页面检索、作者评分走势追踪、虚拟股市与丰富社区工具。"
                />
                <meta property="og:type" content="website" />
            </Head>

            {/* ==================== Hero ==================== */}
            <section className="relative pt-28 pb-24 overflow-hidden" role="banner" aria-labelledby="hero-title">
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] hero-glow-1"></div>
                    <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[100px] hero-glow-2"></div>
                    <div className="absolute top-1/3 right-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[90px]"></div>
                </div>

                <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6 hero-enter">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/80 border border-gray-700/80 text-gray-400 text-xs tracking-wide backdrop-blur-sm">
                        <span className="relative flex w-1.5 h-1.5">
                            <span className="absolute inline-flex w-full h-full rounded-full bg-green-500 opacity-75 animate-ping" aria-hidden="true"></span>
                            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
                        </span>
                        已收录 {wikis.length} 个站点
                    </div>

                    <h1
                        id="hero-title"
                        className="text-5xl sm:text-6xl font-bold text-white leading-[1.1] tracking-tight"
                    >
                        Wikidot 社区的
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-[length:200%_auto] gradient-animate">
                            数据归档站
                        </span>
                    </h1>

                    <p className="text-gray-400 text-lg leading-relaxed max-w-lg mx-auto">
                        搜页面、查作者、看数据。把散落在各个分站的内容串起来，都在这一个地方搞定。
                    </p>

                    {/* 搜索框 */}
                    <form
                        onSubmit={onSearch}
                        role="search"
                        className="mx-auto mt-8 max-w-xl w-full group"
                    >
                        <label htmlFor="hero-q" className="sr-only">搜索页面或关键词</label>
                        <div className="relative flex items-center rounded-2xl bg-gray-900/70 border border-gray-700/60 backdrop-blur-md shadow-lg shadow-black/20 focus-within:border-indigo-500/50 focus-within:shadow-indigo-500/10 transition-all">
                            <i aria-hidden="true" className="fa-solid fa-magnifying-glass text-gray-500 group-focus-within:text-indigo-400 transition-colors ml-4"></i>
                            <input
                                id="hero-q"
                                type="search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="搜索页面、作者、标签……（留空进入浏览）"
                                className="flex-1 bg-transparent text-white placeholder-gray-500 py-3.5 px-3 outline-none"
                                autoComplete="off"
                                spellCheck="false"
                            />
                            <button
                                type="submit"
                                className="mr-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                                aria-label="搜索"
                            >
                                搜索
                            </button>
                        </div>
                    </form>

                    {/* 快速入口 chip 行 */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2" role="list" aria-label="快速入口">
                        {quickLinks.map((it) => (
                            <a
                                key={it.href}
                                role="listitem"
                                href={it.href}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-gray-400 bg-gray-800/60 border border-gray-700/50 hover:border-indigo-500/40 hover:text-indigo-300 hover:bg-gray-800 transition-colors"
                            >
                                <i aria-hidden="true" className={`fa-solid ${it.icon} text-[10px]`}></i>
                                {it.text}
                            </a>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                        <Link
                            href="/pages"
                            className="group inline-flex items-center px-7 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                        >
                            <i aria-hidden="true" className="fa-solid fa-magnifying-glass mr-2 text-sm"></i>
                            开始检索
                            <i aria-hidden="true" className="fa-solid fa-arrow-right ml-2 text-xs opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"></i>
                        </Link>
                        <Link
                            href="/about"
                            className="px-7 py-3 text-gray-300 font-medium rounded-xl border border-gray-700 hover:bg-gray-800 hover:border-gray-600 transition-all hover:-translate-y-0.5"
                        >
                            了解更多
                        </Link>
                    </div>
                </div>
            </section>

            {/* 装饰分隔符 */}
            <div aria-hidden="true" className="flex justify-center my-2">
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-gray-700/80 to-transparent"></div>
            </div>

            {/* ==================== 数据亮点 ==================== */}
            <section className="max-w-5xl mx-auto px-4 py-12 fade-enter" aria-label="数据亮点" style={{ animationDelay: '0.1s' }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats(wikis.length).map((item, i) => (
                        <div
                            key={i}
                            className="group text-center py-6 px-4 rounded-2xl bg-gray-800/20 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/40 transition-all hover:-translate-y-1"
                        >
                            <i aria-hidden="true" className={`fa-solid ${item.icon} text-base ${item.color} mb-2 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all`}></i>
                            <div className="text-2xl font-bold tabular-nums text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                {item.num}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 tracking-wide">{item.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ==================== 功能区 ==================== */}
            <section
                aria-labelledby="features-title"
                className="max-w-5xl mx-auto px-4 fade-enter"
                style={{ animationDelay: '0.2s' }}
            >
                <div className="text-center mb-12">
                    <h2 id="features-title" className="text-3xl font-bold text-white">能帮你做什么</h2>
                    <p className="text-gray-500 mt-2">不只是个数据库，也是个工具箱</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {features.map((feat, i) => (
                        <a
                            key={i}
                            href={feat.href}
                            className={`group relative p-6 rounded-2xl bg-gradient-to-b ${feat.color} border border-gray-700/40 ${feat.border} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${feat.glow} block`}
                        >
                            <div className={`w-11 h-11 rounded-xl bg-gray-900/60 backdrop-blur-sm flex items-center justify-center ${feat.iconColor} mb-5 transition-transform group-hover:scale-110`}>
                                <i aria-hidden="true" className={`fa-solid ${feat.icon} text-lg`}></i>
                            </div>
                            <h3 className="text-lg text-white font-semibold mb-2">{feat.title}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">{feat.desc}</p>
                            <div className="mt-5 inline-flex items-center text-xs text-gray-400 group-hover:text-indigo-300 transition-colors">
                                {feat.cta}
                                <i aria-hidden="true" className="fa-solid fa-arrow-right ml-1.5 group-hover:translate-x-0.5 transition-transform"></i>
                            </div>
                        </a>
                    ))}
                </div>

                {/* 小工具 chip 行 */}
                <div role="group" aria-label="常用工具" className="mt-12 rounded-2xl bg-gray-800/20 border border-gray-700/40 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-gray-300 font-medium">
                            <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles text-sm text-amber-400"></i>
                            常用工具直达
                        </div>
                        <Link href="/tools" className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
                            全部工具
                            <i aria-hidden="true" className="fa-solid fa-chevron-right text-[10px]"></i>
                        </Link>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {tools.map((t) => (
                            <a
                                key={t.href}
                                href={t.href}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900/50 border border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/60 transition-all hover:-translate-y-0.5 text-sm text-gray-300 hover:text-white"
                            >
                                <i aria-hidden="true" className={`fa-solid ${t.icon} text-xs ${t.color}`}></i>
                                {t.text}
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            {/* 装饰分隔符 */}
            <div aria-hidden="true" className="flex justify-center items-center gap-3 my-16">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-gray-700/80"></div>
                <i aria-hidden="true" className="fa-solid fa-diamond text-[6px] text-gray-600"></i>
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-gray-700/80"></div>
            </div>

            {/* ==================== 收录站点 ==================== */}
            <section
                aria-labelledby="wikis-title"
                className="max-w-5xl mx-auto px-4 fade-enter"
                style={{ animationDelay: '0.3s' }}
            >
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h2 id="wikis-title" className="text-3xl font-bold text-white">收录站点</h2>
                        <p className="text-gray-500 mt-2">点击查看各站点的数据概览和最新动态</p>
                    </div>
                    <span className="hidden sm:block text-sm text-gray-600 tabular-nums">
                        {wikis.length} 个站点
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {wikis.map((wiki) => {
                        const param = wiki.PARAM || wiki.PAEAM || '';
                        return (
                            <a
                                key={param}
                                href={`/site/${param}`}
                                className="group relative flex items-center gap-5 rounded-2xl bg-gray-800/30 p-5 border border-gray-700/40 hover:border-indigo-500/40 hover:bg-gray-800/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/5"
                                aria-label={`${wiki.NAME} 站点概览`}
                            >
                                <div className="h-16 w-16 shrink-0 flex items-center justify-center overflow-hidden rounded-2xl bg-gray-900 border border-gray-700/60 group-hover:border-gray-600 transition-colors">
                                    <img
                                        src={wiki.ImgURL}
                                        alt={`${wiki.NAME} logo`}
                                        loading="lazy"
                                        width={64}
                                        height={64}
                                        onError={imgFallback}
                                        className="h-full w-full object-contain p-2.5"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                                        {wiki.NAME}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1 font-mono truncate">{param}</p>
                                </div>
                                <div aria-hidden="true" className="text-gray-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all">
                                    <i className="fa-solid fa-arrow-right text-sm"></i>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </section>

            {/* 装饰分隔符 */}
            <div aria-hidden="true" className="flex justify-center items-center gap-3 my-16">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-gray-700/80"></div>
                <i aria-hidden="true" className="fa-solid fa-diamond text-[6px] text-gray-600"></i>
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-gray-700/80"></div>
            </div>

            {/* ==================== FAQ ==================== */}
            <section
                aria-labelledby="faq-title"
                className="max-w-3xl mx-auto px-4 fade-enter"
                style={{ animationDelay: '0.35s' }}
            >
                <div className="text-center mb-10">
                    <h2 id="faq-title" className="text-3xl font-bold text-white">常见问题</h2>
                    <p className="text-gray-500 mt-2">若没找到答案，可查看关于页或联系管理员</p>
                </div>
                <div className="space-y-3">
                    {faqs.map((f, i) => (
                        <details
                            key={i}
                            className="group rounded-2xl bg-gray-800/20 border border-gray-700/40 overflow-hidden transition-colors hover:border-gray-700/70"
                        >
                            <summary className="flex items-center justify-between cursor-pointer px-6 py-4 list-none select-none">
                                <span className="font-medium text-white pr-4 flex items-start gap-3">
                                    <i aria-hidden="true" className="fa-solid fa-circle-question text-indigo-400 text-sm mt-0.5 shrink-0"></i>
                                    <span>{f.q}</span>
                                </span>
                                <i aria-hidden="true" className="fa-solid fa-chevron-down text-gray-500 group-open:rotate-180 transition-transform text-xs shrink-0"></i>
                            </summary>
                            <div className="px-6 pb-5 pl-[60px] text-gray-400 leading-relaxed text-sm">
                                {f.a}
                            </div>
                        </details>
                    ))}
                </div>
                <div className="text-center mt-6 text-xs text-gray-600">
                    想了解更多？{' '}
                    <Link href="/about" className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline">
                        查看完整介绍页
                    </Link>
                </div>
            </section>

            {/* ==================== 底部 CTA ==================== */}
            <section
                aria-labelledby="cta-title"
                className="max-w-5xl mx-auto px-4 pt-20 fade-enter"
                style={{ animationDelay: '0.4s' }}
            >
                <div className="relative rounded-3xl overflow-hidden">
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-indigo-600/90 to-indigo-900/90"></div>
                    <div aria-hidden="true" className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-60"></div>
                    <div className="relative px-8 py-14 sm:px-14 text-center">
                        <h3 id="cta-title" className="text-2xl sm:text-3xl font-bold text-white">注册一下？</h3>
                        <p className="text-indigo-100/70 mt-3 max-w-md mx-auto">
                            有账号才能用作者评分、动态追踪、高级搜索这些功能。免费的，花不了一分钟。
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                            <Link
                                href="/register"
                                className="inline-flex items-center px-8 py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-100 transition-all hover:-translate-y-0.5 shadow-lg"
                            >
                                <i aria-hidden="true" className="fa-solid fa-user-plus mr-2 text-sm"></i>
                                注册账号
                            </Link>
                            <Link
                                href="/login"
                                className="px-8 py-3 text-white font-semibold rounded-xl bg-white/10 hover:bg-white/20 transition-all hover:-translate-y-0.5 backdrop-blur-sm border border-white/20"
                            >
                                已有账号，登录
                            </Link>
                        </div>
                        <p className="mt-4 text-[11px] text-indigo-200/60 tracking-wide">
                            <i aria-hidden="true" className="fa-solid fa-lock mr-1"></i>
                            仅需短信验证防机器人，不与第三方共享
                        </p>
                    </div>
                </div>
            </section>

            <style jsx>{`
                @keyframes gradientShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes glowPulse1 {
                    0%, 100% { opacity: 0.6; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.08); }
                }
                @keyframes glowPulse2 {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.1); }
                }
                .gradient-animate {
                    animation: gradientShift 6s ease infinite;
                }
                .hero-enter {
                    animation: fadeUp 0.7s ease-out both;
                }
                .fade-enter {
                    animation: fadeUp 0.7s ease-out both;
                }
                .hero-glow-1 {
                    animation: glowPulse1 8s ease-in-out infinite;
                }
                .hero-glow-2 {
                    animation: glowPulse2 10s ease-in-out infinite;
                }
                /* 去除 details 原生 marker（我们用自定义图标） */
                summary::-webkit-details-marker { display: none; }
                @media (prefers-reduced-motion: reduce) {
                    .gradient-animate, .hero-enter, .fade-enter, .hero-glow-1, .hero-glow-2 {
                        animation: none;
                    }
                    * { transition-duration: 0ms !important; }
                }
            `}</style>
        </div>
    );
};

export default Home;
