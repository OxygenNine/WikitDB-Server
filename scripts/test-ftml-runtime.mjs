import { readFile } from 'node:fs/promises';
import {
    PageInfo,
    WikitextSettings,
    initSync,
    parse,
    preprocess,
    render_html,
    tokenize,
    version,
} from '../public/vendor/ftml/ftml.js';

const wasm = await readFile(new URL('../public/vendor/ftml/ftml_bg.wasm', import.meta.url));
initSync({ module: wasm });

const pageInfo = () => new PageInfo({
    page: 'sandbox:runtime-test',
    category: null,
    site: 'sandbox',
    title: 'Runtime Test',
    'alt-title': null,
    score: 0,
    tags: [],
    language: 'zh-cn',
});

const tokens = tokenize(preprocess('+ Runtime Test\n\n**FTML works.**'));
const outcome = parse(
    tokens,
    pageInfo(),
    WikitextSettings.from_mode('draft', 'wikidot')
);
const output = render_html(
    outcome.syntax_tree(),
    pageInfo(),
    WikitextSettings.from_mode('draft', 'wikidot')
);
const html = output.body();

if (!html.includes('FTML works.')) {
    throw new Error('FTML runtime did not produce the expected HTML');
}

console.log(`FTML ${version()} runtime OK`);
