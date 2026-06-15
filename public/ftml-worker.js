import initFtml, {
    PageInfo,
    WikitextSettings,
    parse,
    preprocess,
    render_html,
    tokenize,
    version,
} from './vendor/ftml/ftml.js';

const MAX_SOURCE_LENGTH = 300000;
let readyPromise;

function ensureReady() {
    if (!readyPromise) {
        readyPromise = initFtml('/vendor/ftml/ftml_bg.wasm');
    }
    return readyPromise;
}

function makePageInfo(meta = {}) {
    return new PageInfo({
        page: String(meta.page || 'sandbox:ftml-preview'),
        category: null,
        site: String(meta.site || 'sandbox'),
        title: String(meta.title || 'FTML Preview'),
        'alt-title': null,
        score: Number(meta.score || 0),
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
        language: 'zh-cn',
    });
}

function render(source, meta) {
    const processed = preprocess(source);
    const tokens = tokenize(processed);
    const outcome = parse(
        tokens,
        makePageInfo(meta),
        WikitextSettings.from_mode('draft', 'wikidot')
    );
    const errors = outcome.errors() || [];
    const tree = outcome.syntax_tree();
    const output = render_html(
        tree,
        makePageInfo(meta),
        WikitextSettings.from_mode('draft', 'wikidot')
    );

    return {
        html: output.body(),
        errors,
        version: version(),
    };
}

self.addEventListener('message', async (event) => {
    const request = event.data || {};
    const id = request.id;

    try {
        const source = String(request.source || '');
        if (source.length > MAX_SOURCE_LENGTH) {
            throw new Error('源码超过 300,000 字符限制');
        }

        await ensureReady();
        self.postMessage({ id, ok: true, ...render(source, request.meta) });
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
