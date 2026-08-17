const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BASE_DEFAULT,
    buildTimerUrl,
    buildTimerIframe,
    buildAnnouncementText,
    buildAnnouncementTitle,
    parsePageName,
    mergeTags,
} = require('../utils/staffPostDeletion');

test('buildTimerUrl 生成带 lang=cn 与未来 time 参数的 URL', () => {
    const url = buildTimerUrl('https://example.com/timer/timer.html', {
        deleteScore: -5,
        countdownHours: 72
    });
    assert.ok(url.startsWith('https://example.com/timer/timer.html?'));
    assert.ok(url.includes('lang=cn'));
    assert.ok(url.includes('time='));
    // time 参数应为约 72 小时后的 ISO 时间
    const timeParam = new URL(url).searchParams.get('time');
    const diffMs = new Date(timeParam).getTime() - Date.now();
    const diffHours = diffMs / 3600000;
    assert.ok(diffHours > 71.9 && diffHours < 72.5, `time 应在约72小时后，实际 ${diffHours}h`);
});

test('buildTimerUrl 支持 progress/finished 自定义文案', () => {
    const url = buildTimerUrl('https://example.com/timer/timer.html', {
        progressMessage: '此页面将在计时器到期后可供删除：',
        finishedMessage: '此页面在下列时间前已可供删除：'
    });
    assert.ok(url.includes('progress='));
    assert.ok(url.includes('finished='));
});

test('buildTimerIframe 返回 [[iframe ...]] wikitext', () => {
    const iframe = buildTimerIframe('https://example.com/timer/timer.html', {
        countdownHours: 24,
        width: '100%',
        height: '90px'
    });
    assert.match(iframe, /^\[\[iframe /);
    assert.match(iframe, /timer\.html\?/);
    assert.match(iframe, /style="width: 100%; height: 90px; border: 0; text-align: center;"\]\]$/);
});

test('buildAnnouncementText 为删文帖格式：分数 + 计时器 iframe，不含页面标题', () => {
    const text = buildAnnouncementText({
        deleteScore: -5,
        timerIframe: '[[iframe https://x/timer.html?lang=cn]]'
    });
    assert.ok(text.includes('-5 分'));
    assert.ok(text.includes('[[iframe https://x/timer.html?lang=cn]]'));
    assert.ok(text.includes('宣告将删除此页'));
    assert.ok(text.includes('删帖指导'));
    assert.ok(!text.includes('scp-001'));
    // 格式与 D:\scp\timer 中文 template-deletion 一致：标题后接空行 + iframe
    assert.ok(text.includes('宣告将删除此页：\n\n[[iframe'));
});

test('buildAnnouncementTitle 固定返回「职员帖：删除宣告」', () => {
    assert.equal(buildAnnouncementTitle(), '职员帖：删除宣告');
    // 兼容历史调用（传入参数也被忽略）
    assert.equal(buildAnnouncementTitle({ pageName: 'scp-001' }), '职员帖：删除宣告');
});

test('parsePageName 支持纯名称 / 完整 URL / 命名空间', () => {
    assert.equal(parsePageName('scp-001'), 'scp-001');
    assert.equal(parsePageName('https://deep-forest-club.wikidot.com/scp-002'), 'scp-002');
    assert.equal(parsePageName('  deleted:old-page  '), 'deleted:old-page');
    assert.equal(parsePageName(''), '');
    assert.equal(parsePageName('   '), '');
});

test('mergeTags 追加新标签并去重', () => {
    assert.deepEqual(mergeTags(['wiki', '原创'], '待删除'), ['wiki', '原创', '待删除']);
    assert.deepEqual(mergeTags(['待删除'], '待删除'), ['待删除']);
    assert.deepEqual(mergeTags('wiki, 原创', '待删除'), ['wiki', '原创', '待删除']);
    assert.deepEqual(mergeTags([], '待删除'), ['待删除']);
});
