const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isSafePageName,
    parseIncludeDirective,
    resolveIncludeTarget,
    substituteVariables,
} = require('../utils/ftmlIncludes');

const sites = [
    { PARAM: 'scp', WIKIT_ID: 'scp-wiki' },
    { PARAM: 'brcn', WIKIT_ID: 'backrooms-wiki-cn' },
    { PARAM: 'rule-sandbox', WIKIT_ID: 'rule-wiki-sandbox' },
];

test('parses include variables without accepting malformed keys', () => {
    assert.deepEqual(
        parseIncludeDirective('component:box | title = Hello | bad key = ignored'),
        { page: 'component:box', variables: { title: 'Hello' } }
    );
});

test('only resolves configured include sites and safe page names', () => {
    assert.deepEqual(resolveIncludeTarget(':scp-wiki:component:box', 'brcn', sites), {
        site: 'scp',
        page: 'component:box',
    });
    assert.equal(resolveIncludeTarget(':attacker:page', 'brcn', sites), null);
    assert.deepEqual(resolveIncludeTarget(':rule-wiki-sandbox:component:theme', 'brcn', sites), {
        site: 'rule-sandbox',
        page: 'component:theme',
    });
    assert.equal(resolveIncludeTarget('../admin', 'brcn', sites), null);
    assert.equal(isSafePageName('component:theme'), true);
    assert.equal(isSafePageName('https://attacker.example'), false);
});

test('substitutes declared include variables only', () => {
    assert.equal(
        substituteVariables('Hello {$name}; {$missing}', { name: '<b>User</b>' }),
        'Hello <b>User</b>; {$missing}'
    );
});
