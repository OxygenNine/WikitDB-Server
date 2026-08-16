const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const prisma = require('./lib/prisma');
const config = require('./wikitdb.config.js');
const { fetchCategories, fetchThreads, fetchPosts } = require('./utils/wikidotForum');
const { getGraphQLEndpoint } = require('./utils/graphql');
const { buildTimerIframe, buildAnnouncementText, buildAnnouncementTitle } = require('./utils/staffPostDeletion');
const { login, addTag, postAnnouncement, buildHeaders } = require('./utils/wikidotStaffActions');
const { decryptPassword } = require('./utils/botAccountCrypto');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const request = axios.create({
    httpAgent,
    httpsAgent,
    timeout: 15000
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

let botCookieCache = null;

async function getBotCookie() {
    if (botCookieCache) return botCookieCache;
    const user = process.env.WIKIDOT_BOT_USER;
    const pass = process.env.WIKIDOT_BOT_PASS;
    if (!user || !pass) {
        console.log("未配置机器人账号，将以访客身份进行抓取...");
        return null;
    }

    try {
        const payload = new URLSearchParams({ login: user, password: pass, action: 'Login2Action', event: 'login' });
        const res = await axios.post('https://www.wikidot.com/default--flow/login__LoginPopupScreen', payload.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WikitDB-Bot/1.0' },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });
        let sessionId = '';
        const cookies = res.headers['set-cookie'] || [];
        for (const c of cookies) {
            if (c.includes('WIKIDOT_SESSION_ID=')) {
                sessionId = c.split('WIKIDOT_SESSION_ID=')[1].split(';')[0];
            }
        }
        if (sessionId) {
            botCookieCache = `WIKIDOT_SESSION_ID=${sessionId}; wikidot_token7=123456;`;
            console.log("机器人账号登录成功，已获取受限站点抓取权限。");
        }
    } catch (e) {
        console.error('获取 Bot Cookie 失败:', e.message);
    }
    return botCookieCache;
}

let isRunning = false;

async function runCrawler() {
    if (isRunning) {
        console.log(`[${new Date().toLocaleString()}] 警告：上一轮爬虫尚未结束，跳过本次触发。`);
        return;
    }
    isRunning = true;

    try {
        const botCookie = await getBotCookie();
        const baseHeaders = { 'User-Agent': 'Mozilla/5.0' };
        if (botCookie) baseHeaders['Cookie'] = botCookie;

        console.log(`\n[${new Date().toLocaleString()}] 开始执行全站数据(评分+讨论区)爬取...`);
        for (const siteConfig of config.SUPPORT_WIKI) {
            const wikiParam = siteConfig.PARAM;
            const actualWikiName = siteConfig.URL.replace(/^https?:\/\//i, '').split('.')[0];
            const baseUrl = siteConfig.URL.replace(/\/$/, '');

            let allPages = [];
            let pageNum = 1;
            let totalPages = 1;
            let hasMore = true;

            while (hasMore) {
                try {
                    process.stdout.write(`获取 [${wikiParam}] 清单 第 ${pageNum} 页... `);
                    const res = await request.get(`https://wikit.unitreaty.org/listpages?wiki=${actualWikiName}&p=${pageNum}`);
                    const lines = res.data.split('\n').map(l => l.trim()).filter(Boolean);
                    let countThisPage = 0;

                    lines.forEach(line => {
                        if (line.startsWith('Total Pages:')) {
                            totalPages = parseInt(line.replace('Total Pages:', '').trim(), 10) || 1;
                        } else if (line.includes('http') && line.includes('|')) {
                            const parts = line.split('|').map(item => item.trim());
                            if (parts.length >= 7) {
                                const url = parts[0];
                                const pageSlug = url.split('/').pop();
                                let author = parts[6] || '未知';
                                const match = author.match(/^(.*?)\s*\(\d+\)$/);
                                if (match) author = match[1].trim();

                                allPages.push({ page: pageSlug, title: parts[1], author: author, wiki: wikiParam });
                                countThisPage++;
                            }
                        }
                    });
                    console.log(`成功 ${countThisPage} 篇`);
                    if (pageNum >= totalPages) hasMore = false;
                    else pageNum++;
                } catch (e) {
                    await sleep(3000);
                }
                await sleep(1000);
            }

            let userVotesMap = {};
            let count = 0;
            const CONCURRENCY = 3;

            for (let i = 0; i < allPages.length; i += CONCURRENCY) {
                const batch = allPages.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (pageNode) => {
                    const secureUrl = `${baseUrl}/${pageNode.page}`;
                    let success = false, attempt = 0;
                    
                    while (!success && attempt < 3) {
                        attempt++;
                        try {
                            const { data: html } = await request.get(secureUrl, { headers: baseHeaders });
                            
                            const $page = cheerio.load(html);
                            let threadId = null;
                            
                            let href = $page('#discuss-button').attr('href');
                            if (!href) href = $page('#page-info a').filter((_, el) => ($page(el).attr('href')||'').includes('/forum/t-')).attr('href');
                            if (!href) href = $page('#page-content').parent().find('a').filter((_, el) => {
                                const text = $page(el).text().toLowerCase();
                                return (text.includes('discuss') || text.includes('讨论') || text.includes('评论')) && ($page(el).attr('href')||'').includes('/forum/t-');
                            }).attr('href');

                            if (href) {
                                const match = href.match(/\/forum\/t-(\d+)/);
                                if (match) threadId = match[1];
                            }

                            const cacheKey = `forum_v7:${wikiParam}:${pageNode.page}`;

                            if (threadId) {
                                try {
                                    const forumUrl = `${baseUrl}/forum/t-${threadId}`;
                                    const { data: forumHtml } = await request.get(forumUrl, { headers: baseHeaders });
                                    const $forum = cheerio.load(forumHtml);
                                    const posts = [];
                                    const userIdCache = {};
                                    
                                    const postElements = $forum('.post').toArray();
                                    for (const el of postElements) {
                                        const $el = $forum(el);
                                        const postId = ($el.attr('id') || '').replace('post-', '');
                                        if (!postId) continue;

                                        let parentId = null;
                                        const $parentContainer = $el.parent('.post-container').parent('.post-container');
                                        if ($parentContainer.length) {
                                            const $parentPost = $parentContainer.children('.post').first();
                                            parentId = ($parentPost.attr('id') || '').replace('post-', '');
                                        }

                                        let author = '未知用户';
                                        const $printUser = $el.find('.head .printuser').length ? $el.find('.head .printuser').first() : $el.find('.info .printuser').first();
                                        
                                        if ($printUser.length) {
                                            const $links = $printUser.find('a');
                                            if ($links.length) author = $links.last().text().trim();
                                            else author = $printUser.text().trim();
                                        } else {
                                            author = $el.find('.head .author, .info .author').first().text().trim() || '未知用户';
                                        }
                                        author = author.replace(/[\r\n\t]+/g, '').trim();

                                        let userid = null;
                                        const headHtml = $el.find('.head').html() || $el.find('.info').html() || $el.html() || '';
                                        const srcMatch = headHtml.match(/avatar\.php\?userid=(\d+)/i);
                                        const clickMatch = headHtml.match(/userInfo\(\s*(\d+)\s*\)/i);
                                        const karmaMatch = headHtml.match(/userkarma\.php\?u=(\d+)/i);

                                        if (srcMatch) userid = srcMatch[1];
                                        else if (clickMatch) userid = clickMatch[1];
                                        else if (karmaMatch) userid = karmaMatch[1];

                                        if (!userid && author !== '未知用户') {
                                            if (userIdCache[author]) {
                                                userid = userIdCache[author];
                                            } else {
                                                try {
                                                    const lookupRes = await axios.get(`https://www.wikidot.com/quickmodule.php?module=UserLookupQModule&q=${encodeURIComponent(author)}`, { timeout: 5000 });
                                                    if (lookupRes.data && lookupRes.data.users && lookupRes.data.users.length > 0) {
                                                        userid = lookupRes.data.users[0].user_id;
                                                        userIdCache[author] = userid;
                                                    }
                                                } catch (lookupErr) {
                                                    // 忽略查询报错
                                                }
                                            }
                                        }

                                        let avatarUrl = '';
                                        if (userid) {
                                            const currentTs = Math.floor(Date.now() / 1000);
                                            avatarUrl = `https://www.wikidot.com/avatar.php?userid=${userid}&timestamp=${currentTs}`;
                                        } else {
                                            avatarUrl = `https://www.wikidot.com/avatar.php?account=default`;
                                        }

                                        const contentHtml = $el.find('.content').html() || '';
                                        const odate = $el.find('.odate').first();
                                        const odateClass = odate.attr('class') || '';
                                        const timeMatch = odateClass.match(/time_(\d+)/);
                                        
                                        let timestamp = odate.text().trim();
                                        if (timeMatch) {
                                            const dateObj = new Date(parseInt(timeMatch[1]) * 1000);
                                            timestamp = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                                        } else if (odate.attr('title')) timestamp = odate.attr('title');

                                        posts.push({ postId, parentId, author, avatarUrl, timestamp, contentHtml, children: [] });
                                    }
                                    
                                    const postMap = {};
                                    const rootPosts = [];
                                    posts.forEach(p => { p.children = []; postMap[p.postId] = p; });
                                    posts.forEach(p => { 
                                        if (p.parentId && postMap[p.parentId]) postMap[p.parentId].children.push(p); 
                                        else rootPosts.push(p); 
                                    });
                                    
                                    const forumData = { threadId, url: forumUrl, total: posts.length, threads: rootPosts };
                                    
                                    await prisma.setting.upsert({
                                        where: { key: cacheKey },
                                        update: { value: JSON.stringify(forumData) },
                                        create: { key: cacheKey, value: JSON.stringify(forumData) }
                                    });
                                    console.log(`[成功] 讨论区入库: ${pageNode.page} (${posts.length}条)`);
                                } catch (forumErr) {
                                    console.error(`[失败] ${pageNode.page} 讨论区抓取报错: ${forumErr.message}`);
                                }
                            } else {
                                const emptyData = { threadId: null, url: '', total: 0, threads: [] };
                                await prisma.setting.upsert({
                                    where: { key: cacheKey },
                                    update: { value: JSON.stringify(emptyData) },
                                    create: { key: cacheKey, value: JSON.stringify(emptyData) }
                                });
                            }

                            let pageId = null;
                            const idMatch = html.match(/pageId\s*[:=]\s*['"]?(\d+)['"]?/i) || html.match(/page_id\s*[:=]\s*['"]?(\d+)['"]?/i);
                            if (idMatch) pageId = idMatch[1];
                            if (!pageId) { success = true; return; }

                            const origin = new URL(secureUrl).origin;
                            const ajaxUrl = `${origin}/ajax-module-connector.php`;
                            
                            const ajaxHeaders = {
                                'User-Agent': 'Mozilla/5.0',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'Cookie': botCookie ? botCookie : 'wikidot_token7=123456;'
                            };
                            const { data: rateData } = await request.post(ajaxUrl, `pageId=${pageId}&page_id=${pageId}&moduleName=pagerate/WhoRatedPageModule&wikidot_token7=123456`, {
                                headers: ajaxHeaders
                            });

                            if (rateData.status === 'ok' && rateData.body) {
                                const $rate = cheerio.load(rateData.body);
                                $rate('.printuser').each((_, el) => {
                                    const user = $rate(el).text().trim();
                                    let vote = '+1', textAfter = '', curr = el.next;
                                    while (curr) {
                                        if (curr.type === 'tag' && (curr.tagName === 'br' || (curr.attribs && curr.attribs.class && curr.attribs.class.includes('printuser')))) break;
                                        if (curr.type === 'text') textAfter += curr.data;
                                        else if (curr.type === 'tag') textAfter += $rate(curr).text();
                                        curr = curr.next;
                                    }
                                    if (textAfter.includes('-')) vote = '-1';
                                    if (!userVotesMap[user]) userVotesMap[user] = [];
                                    userVotesMap[user].push({ wiki: wikiParam, page: pageNode.page, title: pageNode.title, vote: vote, author: pageNode.author, date: Date.now() });
                                });
                            }
                            success = true;
                        } catch (err) {
                            if (attempt < 3) await sleep(2000);
                        }
                    }
                }));

                count += batch.length;
                console.log(`--- 当前进度: [${count}/${allPages.length}] ---`);

                if (count % 100 === 0 || count >= allPages.length) {
                    for (const [user, newVotes] of Object.entries(userVotesMap)) {
                        const key = `user_votes_${user.toLowerCase().replace(/_/g, '-').replace(/ /g, '-')}`;
                        const record = await prisma.setting.findUnique({ where: { key } });
                        let existingMap = new Map();
                        if (record) JSON.parse(record.value).forEach(v => existingMap.set(`${v.wiki}:${v.page}`, v));
                        
                        newVotes.forEach(nv => {
                            const id = `${nv.wiki}:${nv.page}`;
                            if (!existingMap.has(id)) existingMap.set(id, nv);
                            else if (existingMap.get(id).vote !== nv.vote) {
                                existingMap.get(id).vote = nv.vote;
                                existingMap.get(id).date = Date.now();
                            }
                        });

                        const truncatedVotes = Array.from(existingMap.values()).sort((a, b) => b.date - a.date).slice(0, 800);
                        await prisma.setting.upsert({
                            where: { key },
                            update: { value: JSON.stringify(truncatedVotes) },
                            create: { key, value: JSON.stringify(truncatedVotes) }
                        });
                    }
                    userVotesMap = {}; 
                }
                await sleep(2500);
            }
        }
    } catch (e) {
        console.error(`发生异常: ${e.message}`);
    } finally {
        isRunning = false;
    }
}

cron.schedule('0 */3 * * *', () => runCrawler());
runCrawler();

// --- 论坛同步定时任务 ---

let isForumSyncing = false;

async function runForumSync() {
    if (isForumSyncing) {
        console.log(`[${new Date().toLocaleString()}] 论坛同步尚未结束，跳过本次触发。`);
        return;
    }
    isForumSyncing = true;

    const sites = config.SUPPORT_WIKI.filter(w => w.FORUM_SYNC);
    if (sites.length === 0) { isForumSyncing = false; return; }

    console.log(`\n[${new Date().toLocaleString()}] 开始论坛数据同步 (${sites.length} 个站点)...`);

    for (const wiki of sites) {
        try {
            const categories = await fetchCategories(wiki.URL);
            console.log(`[${wiki.PARAM}] 获取到 ${categories.length} 个分类`);

            for (const cat of categories) {
                const existing = await prisma.forumCategory.findFirst({
                    where: { siteParam: wiki.PARAM, categoryId: cat.categoryId }
                });
                if (existing) {
                    await prisma.forumCategory.update({
                        where: { id: existing.id },
                        data: { title: cat.title, description: cat.description, threadsCount: cat.threadsCount, postsCount: cat.postsCount, lastSyncedAt: new Date().toISOString() }
                    });
                } else {
                    await prisma.forumCategory.create({
                        data: { siteParam: wiki.PARAM, categoryId: cat.categoryId, title: cat.title, description: cat.description, threadsCount: cat.threadsCount, postsCount: cat.postsCount, lastSyncedAt: new Date().toISOString() }
                    });
                }

                let page = 1, maxPage = 1;
                do {
                    const result = await fetchThreads(wiki.URL, cat.categoryId, page);
                    maxPage = result.maxPage;

                    for (const thread of result.threads) {
                        const existingThread = await prisma.forumThread.findFirst({
                            where: { siteParam: wiki.PARAM, threadId: thread.threadId }
                        });
                        const needSync = !existingThread || existingThread.postCount !== thread.postCount;

                        if (existingThread) {
                            await prisma.forumThread.update({
                                where: { id: existingThread.id },
                                data: { categoryId: cat.categoryId, title: thread.title, createdBy: thread.createdBy, createdAt: thread.createdAt, postCount: thread.postCount, isSticky: thread.isSticky, isLocked: thread.isLocked, lastSyncedAt: new Date().toISOString() }
                            });
                        } else {
                            await prisma.forumThread.create({
                                data: { siteParam: wiki.PARAM, threadId: thread.threadId, categoryId: cat.categoryId, title: thread.title, createdBy: thread.createdBy, createdAt: thread.createdAt, postCount: thread.postCount, isSticky: thread.isSticky, isLocked: thread.isLocked, lastSyncedAt: new Date().toISOString() }
                            });
                        }

                        if (needSync) {
                            let postPage = 1, postMaxPage = 1;
                            do {
                                const postResult = await fetchPosts(wiki.URL, thread.threadId, postPage);
                                postMaxPage = postResult.maxPage;

                                for (const post of postResult.posts) {
                                    const existingPost = await prisma.forumPost.findFirst({
                                        where: { siteParam: wiki.PARAM, postId: post.postId }
                                    });
                                    const postData = { threadId: thread.threadId, parentId: post.parentId || null, title: post.title, contentHtml: post.contentHtml, author: post.author, authorId: post.authorId || null, createdAt: post.createdAt };
                                    if (existingPost) {
                                        await prisma.forumPost.update({ where: { id: existingPost.id }, data: postData });
                                    } else {
                                        await prisma.forumPost.create({ data: { siteParam: wiki.PARAM, postId: post.postId, ...postData } });
                                    }
                                }
                                postPage++;
                            } while (postPage <= postMaxPage);
                            console.log(`  [${wiki.PARAM}] 帖子 t-${thread.threadId} 同步完成`);
                        }
                    }
                    page++;
                } while (page <= maxPage);
            }
            console.log(`[${wiki.PARAM}] 论坛同步完成`);
        } catch (e) {
            console.error(`[${wiki.PARAM}] 论坛同步失败: ${e.message}`);
        }
    }

    isForumSyncing = false;
    console.log(`[${new Date().toLocaleString()}] 论坛同步全部结束。`);
}

// 每天凌晨 4 点执行论坛同步

// --- 自动删帖扫描：自动添加「待删除」标签 + 发布删帖公告 ---

const AUTO_DELETE_DEFAULT_SCORE = -5;          // 默认删除线（评分低于/等于即宣告删除）
const AUTO_DELETE_COUNTDOWN_HOURS = 72;        // 默认倒计时小时数
const AUTO_DELETE_TAG = '待删除';              // 默认标签名

let isAutoDeleting = false;

/** 从 Wikit GraphQL 分页拉取站点带「原创」标签的页面（含评分） */
async function fetchAllSitePages(siteConfig) {
    const endpoint = getGraphQLEndpoint(siteConfig);
    let actualWikiName = '';
    try {
        actualWikiName = new URL(siteConfig.URL).hostname.replace(/^www\./i, '').split('.')[0];
    } catch (e) {
        actualWikiName = siteConfig.URL.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('.')[0];
    }

    const allNodes = [];
    let page = 1;
    const PAGE_SIZE = 100; // Wikit GraphQL 单页上限为 100
    while (true) {
        const res = await axios.post(endpoint, {
            query: `query { articles(wiki: "${actualWikiName}", includeTags: ["原创"], page: ${page}, pageSize: ${PAGE_SIZE}) { nodes { title page rating } } }`
        }, { timeout: 30000 });
        const nodes = res.data?.data?.articles?.nodes || [];
        allNodes.push(...nodes);
        if (nodes.length < PAGE_SIZE) break;
        page++;
        await sleep(500);
    }
    return allNodes;
}

/** 扫描单个站点：拉取页面 → 筛低分 → 打标签 + 发公告（cookie 为空时仅扫描不写操作） */
async function scanSiteForDeletion(siteConfig, cookie, opts = {}) {
    const deleteScore = opts.deleteScore ?? siteConfig.AUTO_DELETE_SCORE ?? AUTO_DELETE_DEFAULT_SCORE;
    const countdownHours = opts.countdownHours ?? siteConfig.AUTO_DELETE_COUNTDOWN_HOURS ?? AUTO_DELETE_COUNTDOWN_HOURS;
    const tag = opts.tag || siteConfig.AUTO_DELETE_TAG || AUTO_DELETE_TAG;
    const canWrite = !!cookie;
    const dedupPrefix = opts.dedupPrefix || 'auto-deletion:v1';
    const baseUrl = siteConfig.URL.replace(/\/$/, '');

    console.log(`[${new Date().toLocaleString()}] 自动扫描站点 [${siteConfig.PARAM}]（删除线 ${deleteScore}，倒计时 ${countdownHours}h，标签「${tag}」${canWrite ? '' : '，仅扫描'}）...`);
    let pages;
    try {
        pages = await fetchAllSitePages(siteConfig);
    } catch (e) {
        console.error(`[${siteConfig.PARAM}] 拉取页面清单失败: ${e.message}`);
        return { scanned: false, candidates: 0 };
    }

    // 筛选低分候选（按页面名去重，避免同一页面在不同分类重复）
    const candidates = [];
    const seenPages = new Set();
    for (const p of pages) {
        if ((p.rating ?? 0) <= deleteScore && !seenPages.has(p.page)) {
            seenPages.add(p.page);
            candidates.push(p);
        }
    }
    console.log(`[${siteConfig.PARAM}] 共 ${pages.length} 个原创页面，低分候选 ${candidates.length} 页`);

    if (!canWrite) {
        candidates.slice(0, 30).forEach((c) => {
            console.log(`  [扫描] ${c.page} (rating=${c.rating})`);
        });
        return { scanned: true, candidates: candidates.length };
    }

    for (const p of candidates) {
        const key = `${dedupPrefix}:${siteConfig.PARAM}:${p.page}`;
        try {
            const existing = await prisma.setting.findUnique({ where: { key } });
            if (existing) {
                console.log(`  [跳过] ${p.page} 已处理过`);
                continue;
            }
        } catch (e) { /* 忽略查询错误 */ }

        // 验证页面真实存在：Wikit 数据可能滞后（含已删除页面），404 则标记跳过，避免反复失败
        try {
            const checkRes = await axios.get(`${baseUrl}/${encodeURIComponent(p.page)}`, {
                headers: buildHeaders(cookie),
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: (s) => s >= 200 && s < 400
            });
        } catch (e) {
            const nfValue = JSON.stringify({ page: p.page, rating: p.rating, status: 'notfound', processedAt: Date.now() });
            try {
                await prisma.setting.upsert({ where: { key }, update: { value: nfValue }, create: { key, value: nfValue } });
            } catch (e2) { /* 忽略 */ }
            console.log(`  [跳过] ${p.page} 页面不存在（可能已删除）`);
            await sleep(1200);
            continue;
        }

        try {
            // 1. 添加「待删除」标签
            const tagRes = await addTag(baseUrl, p.page, cookie, tag);
            await sleep(1200);

            // 2. 发布「职员帖：删除宣告」公告（含删除倒计时 iframe）
            const timerIframe = buildTimerIframe(`${process.env.SITE_ORIGIN || ''}/timer/timer.html`, {
                deleteScore,
                countdownHours
            });
            const text = buildAnnouncementText({ deleteScore, timerIframe, pageName: p.page });
            const title = buildAnnouncementTitle();
            const postRes = await postAnnouncement(baseUrl, p.page, cookie, title, text);

            // 记录处理结果，避免重复
            const value = JSON.stringify({ page: p.page, rating: p.rating, tag, target: postRes.target, processedAt: Date.now() });
            await prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value }
            });
            console.log(`  [成功] ${p.page} (rating=${p.rating}) 已打标签「${tag}」并发布公告 → ${postRes.target}`);
        } catch (e) {
            console.error(`  [失败] ${p.page}: ${e.message}`);
            // 记录失败状态，避免对同一页面反复重试
            const failValue = JSON.stringify({
                page: p.page, rating: p.rating, tag,
                status: 'failed', error: String(e.message || '').slice(0, 200),
                processedAt: Date.now()
            });
            try {
                await prisma.setting.upsert({ where: { key }, update: { value: failValue }, create: { key, value: failValue } });
            } catch (e2) { /* 忽略 */ }
        }
        await sleep(1200);
    }
    return { scanned: true, candidates: candidates.length };
}

async function runAutoStaffDeletion() {
    if (isAutoDeleting) {
        console.log(`[${new Date().toLocaleString()}] 自动删帖扫描尚未结束，跳过本次触发。`);
        return;
    }
    isAutoDeleting = true;
    try {
        const activeSites = config.SUPPORT_WIKI.filter((w) => w.AUTO_STAFF_DELETION !== false);
        if (activeSites.length === 0) {
            console.log(`[${new Date().toLocaleString()}] 没有启用自动删帖的站点。`);
            return;
        }

        // 机器人凭据：未配置则仅扫描不写操作（安全护栏）
        const botUser = process.env.WIKIDOT_BOT_USER || '';
        const botPass = process.env.WIKIDOT_BOT_PASS || '';
        let cookie = null;
        if (botUser && botPass) {
            try {
                cookie = await login(botUser, botPass);
                console.log(`[${new Date().toLocaleString()}] 机器人登录成功，将自动执行打标签 + 发公告。`);
            } catch (e) {
                console.error('机器人登录失败，本次仅扫描:', e.message);
            }
        } else {
            console.log(`[${new Date().toLocaleString()}] 未配置机器人账号（WIKIDOT_BOT_USER/PASS），本次仅扫描站点。`);
        }

        for (const site of activeSites) {
            await scanSiteForDeletion(site, cookie);
        }
        console.log(`[${new Date().toLocaleString()}] 自动删帖扫描结束。`);
    } catch (e) {
        console.error(`自动删帖扫描异常: ${e.message}`);
    } finally {
        isAutoDeleting = false;
    }
}

// --- 机器人定时扫描：按每个机器人配置的扫描间隔与指定站点自动扫描 ---

let isBotScanRunning = false;

async function runBotScheduledScans() {
    if (isBotScanRunning) {
        console.log(`[${new Date().toLocaleString()}] 机器人扫描仍在进行，跳过本次检查。`);
        return;
    }
    isBotScanRunning = true;
    const now = Date.now();
    try {
        const bots = await prisma.botAccount.findMany({
            where: { scanInterval: { not: null } }
        });
        if (bots.length === 0) return;

        for (const bot of bots) {
            const interval = bot.scanInterval;
            if (!interval || interval <= 0) continue;

            // 判断是否到扫描时间（上次扫描 + 间隔）
            const lastScan = bot.lastScanAt ? new Date(bot.lastScanAt).getTime() : 0;
            if (lastScan && (now - lastScan) < interval * 60 * 1000) continue;

            // 读取指定扫描站点
            let sites = [];
            try { sites = JSON.parse(bot.scanSites || '[]'); } catch (e) { sites = []; }
            if (!Array.isArray(sites) || sites.length === 0) {
                console.log(`[${new Date().toLocaleString()}] 机器人「${bot.name}」未指定扫描站点，跳过。`);
                continue;
            }

            // 用机器人账号登录
            let cookie;
            try {
                cookie = await login(bot.username, decryptPassword(bot.password));
            } catch (e) {
                console.error(`机器人「${bot.name}」登录失败: ${e.message}`);
                continue;
            }

            console.log(`[${new Date().toLocaleString()}] 按机器人「${bot.name}」配置开始扫描（间隔 ${interval} 分钟，站点 ${sites.join(', ')}）...`);
            for (const siteParam of sites) {
                const siteConfig = config.SUPPORT_WIKI.find((w) => w.PARAM === siteParam);
                if (!siteConfig) {
                    console.error(`[${siteParam}] 站点配置不存在，跳过。`);
                    continue;
                }
                await scanSiteForDeletion(siteConfig, cookie, {
                    dedupPrefix: `auto-deletion:bot:${bot.id}`,
                    deleteScore: bot.deleteScore,
                    countdownHours: bot.countdownHours
                });
            }

            // 更新上次扫描时间
            try {
                await prisma.botAccount.update({
                    where: { id: bot.id },
                    data: { lastScanAt: new Date() }
                });
            } catch (e) { /* 忽略 */ }
            console.log(`[${new Date().toLocaleString()}] 机器人「${bot.name}」扫描完成。`);
        }
    } catch (e) {
        console.error(`机器人定时扫描异常: ${e.message}`);
    } finally {
        isBotScanRunning = false;
    }
}

// 每天凌晨 3 点执行全局自动删帖扫描（服务器默认 Bot，未配置则仅扫描）
cron.schedule('0 3 * * *', () => runAutoStaffDeletion());
runAutoStaffDeletion();

// 每 5 分钟检查一次机器人定时扫描配置（按间隔与指定站点执行，支持最短 15 分钟间隔）
cron.schedule('*/5 * * * *', () => runBotScheduledScans());
runBotScheduledScans();

cron.schedule('0 4 * * *', () => runForumSync());