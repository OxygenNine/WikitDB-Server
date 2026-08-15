const test = require('node:test');
const assert = require('node:assert/strict');
const {
    extractDiscussionThreadId,
    parseForumRss,
    extractTimerIframe,
} = require('../utils/wikidotPageRss');

const SAMPLE_PAGE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div id="page-content">content</div>
  <div id="page-options-container">
    <div id="page-info">页面版本: 1</div>
    <div id="page-options-bottom" class="page-options-bottom">
      <a href="javascript:;" class="btn btn-default" id="edit-button">编辑</a>
      <a href="javascript:;" class="btn btn-default" id="pagerate-button">评分</a>
      <a href="/forum/t-15612713/major" class="btn btn-default" id="discuss-button">讨论 (8)</a>
      <a href="javascript:;" class="btn btn-default" id="history-button">历史记录</a>
    </div>
  </div>
</body>
</html>
`;

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wikidot="http://www.wikidot.com/rss-namespace">
  <channel>
    <title>回应于 "主页"</title>
    <link>http://example.com/forum/t-12345/</link>
    <description>讨论串中的帖文</description>
    <lastBuildDate>Sat, 15 Aug 2026 04:18:33 +0000</lastBuildDate>
    <item>
      <guid>http://example.com/forum/t-12345#post-6439667</guid>
      <title>(no title)</title>
      <link>http://example.com/forum/t-12345/#post-6439667</link>
      <description></description>
      <pubDate>Sat, 24 Feb 2024 11:23:13 +0000</pubDate>
      <wikidot:authorName>lestday233</wikidot:authorName>
      <wikidot:authorUserId>7504264</wikidot:authorUserId>
      <content:encoded><![CDATA[ <p>Hello <b>world</b></p><script>alert(1)</script> ]]></content:encoded>
    </item>
    <item>
      <guid>http://example.com/forum/t-12345#post-5980257</guid>
      <title>(no title)</title>
      <link>http://example.com/forum/t-12345/#post-5980257</link>
      <pubDate>Wed, 15 Feb 2023 15:00:04 +0000</pubDate>
      <wikidot:authorUserId>8122538</wikidot:authorUserId>
      <content:encoded><![CDATA[ <p>匿名回复</p> ]]></content:encoded>
    </item>
  </channel>
</rss>`;

const SAMPLE_RSS_WITH_TIMER = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wikidot="http://www.wikidot.com/rss-namespace">
  <channel>
    <title>回应于 "主页"</title>
    <link>http://example.com/forum/t-12345/</link>
    <lastBuildDate>Sat, 15 Aug 2026 04:18:33 +0000</lastBuildDate>
    <item>
      <guid>http://example.com/forum/t-12345#post-6439667</guid>
      <title>删除公告</title>
      <link>http://example.com/forum/t-12345/#post-6439667</link>
      <pubDate>Sat, 24 Feb 2024 11:23:13 +0000</pubDate>
      <wikidot:authorName>Laimu_slime</wikidot:authorName>
      <wikidot:authorUserId>1</wikidot:authorUserId>
      <content:encoded><![CDATA[ <p>删除公告：<iframe src="https://timer.backroomswiki.cn/timer/time=1786974943446.245/type=delete" style="width: 400px; height: 65px;"></iframe></p> ]]></content:encoded>
    </item>
  </channel>
</rss>`;

test('extracts discussion thread id from the page option bar', () => {
    const threadId = extractDiscussionThreadId(SAMPLE_PAGE_HTML);
    assert.equal(threadId, '15612713');
});

test('returns null when page has no discussion link', () => {
    const html = '<html><body><div id="page-options-bottom"><a href="/history">历史</a></div></body></html>';
    assert.equal(extractDiscussionThreadId(html), null);
});

test('falls back to any forum/t- link when discuss-button is missing', () => {
    const html = `
        <html><body>
          <div id="page-options-bottom">
            <a href="/forum/t-99999">讨论</a>
          </div>
        </body></html>`;
    assert.equal(extractDiscussionThreadId(html), '99999');
});

test('parses RSS channel metadata and items', () => {
    const parsed = parseForumRss(SAMPLE_RSS);
    assert.equal(parsed.channelTitle, '回应于 "主页"');
    assert.equal(parsed.lastBuildDate, 'Sat, 15 Aug 2026 04:18:33 +0000');
    assert.equal(parsed.items.length, 2);

    const first = parsed.items[0];
    assert.equal(first.postId, '6439667');
    assert.equal(first.authorName, 'lestday233');
    assert.equal(first.authorUserId, '7504264');
    assert.equal(first.pubDate, 'Sat, 24 Feb 2024 11:23:13 +0000');
    // content:encoded 中的 HTML 已被解析且经过消毒（script 被移除）
    assert.match(first.contentHtml, /Hello/);
    assert.doesNotMatch(first.contentHtml, /script|alert/i);
});

test('handles items without author name', () => {
    const parsed = parseForumRss(SAMPLE_RSS);
    const second = parsed.items[1];
    assert.equal(second.authorName, '');
    assert.equal(second.authorUserId, '8122538');
});

test('rejects invalid RSS documents', () => {
    assert.throws(() => parseForumRss('<html><body>not rss</body></html>'));
});

test('extracts countdown timer iframe from RSS items', () => {
    const parsed = parseForumRss(SAMPLE_RSS_WITH_TIMER);
    assert.match(parsed.timerIframe, /<iframe/);
    assert.match(parsed.timerIframe, /timer\.backroomswiki\.cn/);
    assert.match(parsed.timerIframe, /type=delete/);
    // item 级别也带 timerIframe
    assert.equal(parsed.items[0].timerIframe, parsed.timerIframe);
});

test('returns empty timerIframe when RSS has no timer', () => {
    const parsed = parseForumRss(SAMPLE_RSS);
    assert.equal(parsed.timerIframe, '');
});

test('extractTimerIframe only accepts whitelisted domains', () => {
    const trusted = '<iframe src="https://timer.backroomswiki.cn/timer/time=1/type=delete"></iframe>';
    const untrusted = '<iframe src="https://evil.example.com/timer"></iframe>';
    assert.match(extractTimerIframe(trusted), /timer\.backroomswiki\.cn/);
    assert.equal(extractTimerIframe(untrusted), '');
});

