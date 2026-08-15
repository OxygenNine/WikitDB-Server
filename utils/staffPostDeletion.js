/**
 * staff-post-deletion 工具的核心逻辑
 * 功能：自动给页面添加「待删除」标签，并在讨论区发布带删除倒计时器的删帖公告。
 * 计时器 iframe 基于 D:\scp\timer（SCP Wiki Timer）的 timer.html 生成。
 */

const BASE_DEFAULT = {
    TAG_NAME: '待删除',
    DELETE_SCORE: -5,
    COUNTDOWN_HOURS: 72,
    IFRAME_WIDTH: '100%',
    IFRAME_HEIGHT: '100px'
};

/**
 * 生成计时器 URL（timer.html 支持的参数：lang / time / progress / finished / style）
 * @param {string} timerBaseUrl - timer.html 的完整 URL，如 https://example.com/timer/timer.html
 * @param {object} opts
 * @returns {string}
 */
function buildTimerUrl(timerBaseUrl, opts = {}) {
    const countdownHours = parseInt(opts.countdownHours, 10) || BASE_DEFAULT.COUNTDOWN_HOURS;
    const target = new Date(Date.now() + countdownHours * 3600 * 1000);

    const params = new URLSearchParams();
    params.append('lang', 'cn');
    params.append('time', target.toISOString());
    if (opts.progressMessage) params.append('progress', opts.progressMessage);
    if (opts.finishedMessage) params.append('finished', opts.finishedMessage);
    if (opts.style) params.append('style', opts.style);

    const base = String(timerBaseUrl || '').trim();
    return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

/**
 * 生成可插入 Wikidot 页面/论坛帖子的计时器 iframe wikitext
 * @param {string} timerBaseUrl
 * @param {object} opts
 * @returns {string} 如 [[iframe https://.../timer.html?lang=cn&time=... style="width: 100%; height: 100px; border: 0; text-align: center;"]]
 */
function buildTimerIframe(timerBaseUrl, opts = {}) {
    const url = buildTimerUrl(timerBaseUrl, opts);
    const width = opts.width || BASE_DEFAULT.IFRAME_WIDTH;
    const height = opts.height || BASE_DEFAULT.IFRAME_HEIGHT;
    return `[[iframe ${url} style="width: ${width}; height: ${height}; border: 0; text-align: center;"]]`;
}

/**
 * 生成删帖公告正文（与 D:\scp\timer timer-selector.js 的中文 template-deletion 完全一致）
 * @param {object} opts { deleteScore, timerIframe }
 * @returns {string}
 */
function buildAnnouncementText(opts = {}) {
    const score = opts.deleteScore ?? BASE_DEFAULT.DELETE_SCORE;
    const timerIframe = opts.timerIframe || '';

    return [
        `由于条目的分数为 ${score} 分，现根据[[[deletions-guide|删帖指导]]]，宣告将删除此页：`,
        '',
        timerIframe,
        '',
        '**如果你不是作者又想要重写该条目，请在此帖回复申请。请先取得作者（或管理员，如果此文档搬运自聊天室的话）的同意，并将原文的源代码复制至沙盒里。除非你是工作人员，否则请勿就申请重写以外的范围回复此帖。**'
    ].join('\n');
}

/**
 * 生成公告标题（固定为「职员帖：删除宣告」）
 * @returns {string}
 */
function buildAnnouncementTitle() {
    return '职员帖：删除宣告';
}

/**
 * 从输入解析页面名。支持：
 *   - 纯页面名：scp-xxx
 *   - 完整 URL：https://deep-forest-club.wikidot.com/scp-xxx
 * @param {string} raw
 * @returns {string}
 */
function parsePageName(raw) {
    const input = String(raw || '').trim();
    if (!input) return '';
    // 去除可能的协议与域名前缀，取最后一个路径段（含命名空间冒号，如 deleted:xxx）
    const m = input.match(/(?:https?:\/\/[^/]+\/)?([^/?#\s]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

/**
 * 合并标签：保留原有标签并追加新标签（去重）
 * @param {string[]|string} existingTags
 * @param {string} newTag
 * @returns {string[]}
 */
function mergeTags(existingTags, newTag) {
    // Wikidot 标签以英文/中文逗号分隔
    const list = Array.isArray(existingTags)
        ? existingTags
        : String(existingTags || '').split(/[,，]/);
    const tags = list.map((t) => String(t).trim()).filter(Boolean);
    const normalized = newTag ? String(newTag).trim() : '';
    if (normalized && !tags.includes(normalized)) tags.push(normalized);
    // 去重
    return tags.filter((t, i) => tags.indexOf(t) === i);
}

module.exports = {
    BASE_DEFAULT,
    buildTimerUrl,
    buildTimerIframe,
    buildAnnouncementText,
    buildAnnouncementTitle,
    parsePageName,
    mergeTags,
};
