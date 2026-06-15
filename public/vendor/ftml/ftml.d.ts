/* tslint:disable */
/* eslint-disable */

export class HtmlOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    backlinks(): any;
    body(): string;
    copy(): HtmlOutput;
    html_meta(): any;
}

export class PageInfo {
    free(): void;
    [Symbol.dispose](): void;
    copy(): PageInfo;
    constructor(info: any);
    readonly alt_title: string | undefined;
    readonly category: string | undefined;
    readonly language: string;
    readonly page: string;
    readonly score: number;
    readonly site: string;
    readonly tags: any;
    readonly title: string;
}

export class ParseOutcome {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    copy(): ParseOutcome;
    errors(): any;
    syntax_tree(): SyntaxTree;
}

export class SyntaxTree {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    copy(): SyntaxTree;
    data(): any;
}

export class Tokenization {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    copy(): Tokenization;
    text(): string;
    tokens(): any;
}

export class Utf16IndexMap {
    free(): void;
    [Symbol.dispose](): void;
    copy(): Utf16IndexMap;
    get_index(index: number): number;
    constructor(text: string);
}

export class WikitextSettings {
    free(): void;
    [Symbol.dispose](): void;
    copy(): WikitextSettings;
    static from_mode(mode: string, layout: string): WikitextSettings;
    constructor(settings: any);
}

export function parse(tokens: Tokenization, page_info: PageInfo, settings: WikitextSettings): ParseOutcome;

export function preprocess(text: string): string;

export function render_html(syntax_tree: SyntaxTree, page_info: PageInfo, settings: WikitextSettings): HtmlOutput;

export function render_text(syntax_tree: SyntaxTree, page_info: PageInfo, settings: WikitextSettings): string;

export function tokenize(text: string): Tokenization;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_pageinfo_free: (a: number, b: number) => void;
    readonly __wbg_utf16indexmap_free: (a: number, b: number) => void;
    readonly pageinfo_alt_title: (a: number) => [number, number];
    readonly pageinfo_category: (a: number) => [number, number];
    readonly pageinfo_copy: (a: number) => number;
    readonly pageinfo_language: (a: number) => [number, number];
    readonly pageinfo_new: (a: any) => [number, number, number];
    readonly pageinfo_page: (a: number) => [number, number];
    readonly pageinfo_score: (a: number) => number;
    readonly pageinfo_site: (a: number) => [number, number];
    readonly pageinfo_tags: (a: number) => [number, number, number];
    readonly pageinfo_title: (a: number) => [number, number];
    readonly utf16indexmap_copy: (a: number) => number;
    readonly utf16indexmap_get_index: (a: number, b: number) => [number, number, number];
    readonly utf16indexmap_new: (a: number, b: number) => number;
    readonly __wbg_htmloutput_free: (a: number, b: number) => void;
    readonly __wbg_parseoutcome_free: (a: number, b: number) => void;
    readonly __wbg_syntaxtree_free: (a: number, b: number) => void;
    readonly __wbg_tokenization_free: (a: number, b: number) => void;
    readonly __wbg_wikitextsettings_free: (a: number, b: number) => void;
    readonly htmloutput_backlinks: (a: number) => [number, number, number];
    readonly htmloutput_body: (a: number) => [number, number];
    readonly htmloutput_copy: (a: number) => number;
    readonly htmloutput_html_meta: (a: number) => [number, number, number];
    readonly parse: (a: number, b: number, c: number) => [number, number, number];
    readonly parseoutcome_copy: (a: number) => number;
    readonly parseoutcome_errors: (a: number) => [number, number, number];
    readonly parseoutcome_syntax_tree: (a: number) => number;
    readonly render_html: (a: number, b: number, c: number) => number;
    readonly syntaxtree_copy: (a: number) => number;
    readonly syntaxtree_data: (a: number) => [number, number, number];
    readonly tokenization_copy: (a: number) => number;
    readonly tokenization_text: (a: number) => [number, number];
    readonly tokenization_tokens: (a: number) => [number, number, number];
    readonly tokenize: (a: number, b: number) => number;
    readonly wikitextsettings_copy: (a: number) => number;
    readonly wikitextsettings_from_mode: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wikitextsettings_new: (a: any) => [number, number, number];
    readonly version: () => [number, number];
    readonly render_text: (a: number, b: number, c: number) => [number, number];
    readonly preprocess: (a: number, b: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
