// utils/markdownLite.js
// 极简 Markdown -> HTML 渲染器（不引入额外依赖）
// 支持：标题、段落、粗体、斜体、链接、无/有序列表、分隔线、引用、简单表格、内联代码
// 输出最后通过 sanitizeRichHtml 消毒，确保安全
const { sanitizeRichHtml } = require('./htmlSanitizer');

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyInline(text) {
    let s = String(text);
    // 先转义 HTML
    s = escapeHtml(s);
    // 内联代码 `code`
    s = s.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-800/60 text-indigo-300 rounded text-sm font-mono">$1</code>');
    // 粗体 **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
    // 斜体 *text* 或 _text_（避免和 ** 冲突）
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic text-gray-300">$2</em>');
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-500/30">$1</a>');
    // --- 引用块里的加粗符号（保持即可）
    return s;
}

function renderTable(lines) {
    // 寻找 header | sep | body 三段（sep 至少有一个 ---）
    const rows = lines
        .map(l => l.trim())
        .filter(l => l.startsWith('|') && l.endsWith('|'))
        .map(l => l.slice(1, -1).split('|').map(c => c.trim()));
    if (rows.length < 2) return '';
    const [head, ...rest] = rows;
    const sep = rest[0];
    if (!sep || !sep.every(c => /^:?-{3,}:?$/.test(c))) return '';
    const body = rest.slice(1);
    const headHtml = '<thead class="bg-gray-800/60 text-white"><tr>'
        + head.map(h => `<th class="px-4 py-3 text-left text-sm font-semibold border-b border-gray-700">${applyInline(h)}</th>`).join('')
        + '</tr></thead>';
    const bodyHtml = '<tbody class="divide-y divide-gray-800/70">'
        + body.map(r => '<tr class="hover:bg-gray-800/30 transition-colors">'
            + r.map(c => `<td class="px-4 py-3 text-sm text-gray-300">${applyInline(c)}</td>`).join('')
            + '</tr>').join('')
        + '</tbody>';
    return `<div class="overflow-x-auto rounded-xl border border-gray-700/50 my-6"><table class="w-full border-collapse">${headHtml}${bodyHtml}</table></div>`;
}

function markdownLite(md) {
    const src = String(md || '').replace(/\r\n/g, '\n');
    const rawLines = src.split('\n');
    // 预处理：把段落折叠（空行分隔），并识别表格块
    const blocks = [];
    let i = 0;
    while (i < rawLines.length) {
        const line = rawLines[i];
        // 空行跳过
        if (!line.trim()) { i++; continue; }
        // 标题
        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            const level = h[1].length;
            blocks.push({ type: 'h', level, text: h[2].trim() });
            i++; continue;
        }
        // 分隔线
        if (/^\s*---+\s*$/.test(line)) {
            blocks.push({ type: 'hr' });
            i++; continue;
        }
        // 引用块（连续以 > 开头的行）
        if (/^\s*>\s?/.test(line)) {
            const quoteLines = [];
            while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i])) {
                quoteLines.push(rawLines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            blocks.push({ type: 'quote', text: quoteLines.join('\n') });
            continue;
        }
        // 无序列表（连续以 - 或 * 开头，且不是分隔线）
        if (/^\s*[-*]\s+/.test(line) && !/^\s*---+\s*$/.test(line)) {
            const items = [];
            while (i < rawLines.length && /^\s*[-*]\s+/.test(rawLines[i])) {
                items.push(rawLines[i].replace(/^\s*[-*]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }
        // 有序列表
        if (/^\s*\d+\.\s+/.test(line)) {
            const items = [];
            while (i < rawLines.length && /^\s*\d+\.\s+/.test(rawLines[i])) {
                items.push(rawLines[i].replace(/^\s*\d+\.\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ol', items });
            continue;
        }
        // 表格检测：当前行含 | ，且下一行是 --- 分隔
        if (line.includes('|') && i + 1 < rawLines.length && rawLines[i + 1].includes('---')) {
            const tableLines = [];
            while (i < rawLines.length && rawLines[i].trim().includes('|') && rawLines[i].trim()) {
                tableLines.push(rawLines[i]);
                i++;
            }
            blocks.push({ type: 'table', lines: tableLines });
            continue;
        }
        // 普通段落（直到空行）
        const paraLines = [];
        while (i < rawLines.length && rawLines[i].trim()) {
            paraLines.push(rawLines[i]);
            i++;
        }
        blocks.push({ type: 'p', text: paraLines.join(' ') });
    }

    // 渲染
    let html = '';
    for (const b of blocks) {
        switch (b.type) {
            case 'h':
                const cls = b.level <= 2
                    ? 'text-3xl font-bold text-white mt-10 mb-4 tracking-tight'
                    : 'text-xl font-semibold text-white mt-8 mb-3';
                html += `<h${b.level} class="${cls}" id="h-${b.text.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}">${applyInline(b.text)}</h${b.level}>\n`;
                break;
            case 'hr':
                html += '<hr class="my-10 border-t border-gray-700/50" />\n';
                break;
            case 'quote':
                html += `<blockquote class="my-6 pl-5 border-l-4 border-indigo-500/60 bg-indigo-500/5 py-3 pr-4 rounded-r-lg italic text-gray-300 leading-relaxed">${applyInline(b.text)}</blockquote>\n`;
                break;
            case 'ul':
                html += '<ul class="my-4 space-y-2 list-disc pl-6 text-gray-300 leading-relaxed">'
                    + b.items.map(it => `<li>${applyInline(it)}</li>`).join('')
                    + '</ul>\n';
                break;
            case 'ol':
                html += '<ol class="my-4 space-y-2 list-decimal pl-6 text-gray-300 leading-relaxed">'
                    + b.items.map((it, idx) => `<li class="marker:text-indigo-400">${applyInline(it)}</li>`).join('')
                    + '</ol>\n';
                break;
            case 'table':
                html += renderTable(b.lines) + '\n';
                break;
            case 'p':
            default:
                html += `<p class="my-4 text-gray-400 leading-relaxed">${applyInline(b.text)}</p>\n`;
        }
    }
    return sanitizeRichHtml(html);
}

module.exports = { markdownLite, applyInline };
