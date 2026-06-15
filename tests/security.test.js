const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRichHtml } = require('../utils/htmlSanitizer');
const {
    hasDistinctAllowedStrings,
    isArticleOwnedBy,
    isOriginAllowed,
    parseAllowedOrigins,
} = require('../utils/securityPolicy');

test('removes executable HTML and event handlers', () => {
    const result = sanitizeRichHtml(
        '<svg onload=alert(1)></svg><img src="https://example.com/x" onerror=alert(1)>'
    );

    assert.doesNotMatch(result, /svg|onload|onerror|alert/i);
    assert.match(result, /<img src="https:\/\/example\.com\/x" \/>/);
});

test('removes unsafe URL schemes', () => {
    const result = sanitizeRichHtml(
        '<a href="javascript:alert(1)">bad</a><a href="https://example.com">good</a>'
    );

    assert.doesNotMatch(result, /javascript:/i);
    assert.match(result, /https:\/\/example\.com/);
    assert.match(result, /noopener noreferrer nofollow/);
});

test('drops iframe and srcdoc payloads', () => {
    const result = sanitizeRichHtml(
        '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>safe</p>'
    );

    assert.equal(result, '<p>safe</p>');
});

test('rejects missing and forged CSRF origins', () => {
    const allowed = parseAllowedOrigins('https://wikitdb.example', 'production');

    assert.equal(isOriginAllowed({ method: 'POST' }, allowed), false);
    assert.equal(isOriginAllowed({
        method: 'POST',
        origin: 'https://attacker.example',
    }, allowed), false);
    assert.equal(isOriginAllowed({
        method: 'POST',
        origin: 'https://wikitdb.example',
    }, allowed), true);
    assert.equal(isOriginAllowed({
        method: 'POST',
        referer: 'https://wikitdb.example/admin',
    }, allowed), true);
});

test('requires distinct allowed selections for reward games', () => {
    const allowed = ['one', 'two', 'three'];

    assert.equal(hasDistinctAllowedStrings(['one', 'one', 'one'], 3, allowed), false);
    assert.equal(hasDistinctAllowedStrings(['one', 'two', 'other'], 3, allowed), false);
    assert.equal(hasDistinctAllowedStrings(['one', 'two', 'three'], 3, allowed), true);
});

test('requires bounty article ownership', () => {
    assert.equal(isArticleOwnedBy('ExampleUser', 'exampleuser'), true);
    assert.equal(isArticleOwnedBy(['Coauthor', 'ExampleUser'], 'exampleuser'), true);
    assert.equal(isArticleOwnedBy('AnotherUser', 'exampleuser'), false);
    assert.equal(isArticleOwnedBy('ExampleUser', ''), false);
});
