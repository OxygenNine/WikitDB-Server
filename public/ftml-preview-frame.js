(function () {
    'use strict';
    var parentOrigin = '';
    try { parentOrigin = document.referrer ? new URL(document.referrer).origin : ''; } catch (_) {}

    function parseMessage(data) {
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (_) { return null; }
        }
        return data && typeof data === 'object' ? data : null;
    }
    function proxyUrl(url) {
        return '/api/tools/ftml-asset?url=' + encodeURIComponent(url);
    }
    function absoluteUrl(value, siteOrigin) {
        var raw = String(value || '').trim();
        if (!raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw)) return raw;
        if (/^javascript:/i.test(raw)) return '';
        try {
            var url = new URL(raw, siteOrigin);
            url.protocol = 'https:';
            url.hostname = url.hostname.replace(/\.wjfiles\.com$/i, '.wdfiles.com').replace(/\.wikijump\.com$/i, '.wikidot.com');
            return url.href;
        } catch (_) { return ''; }
    }
    function isProxyHost(value) {
        try {
            var host = new URL(value).hostname.toLowerCase();
            return host === 'wikidot.com' || host.endsWith('.wikidot.com')
                || host === 'wdfiles.com' || host.endsWith('.wdfiles.com')
                || host === 'd3g0gp89917ko0.cloudfront.net';
        } catch (_) { return false; }
    }
    function normalizeCss(css, siteOrigin) {
        return String(css || '')
            .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, function (match, quote, raw) {
                if (/^(?:data:|blob:|#|var\()/i.test(raw.trim())) return match;
                var absolute = absoluteUrl(raw, siteOrigin);
                var rewritten = isProxyHost(absolute) ? proxyUrl(absolute) : absolute;
                return 'url(' + quote + rewritten + quote + ')';
            })
            .replace(/@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/gi, function (_, quote, raw) {
                var absolute = absoluteUrl(raw, siteOrigin);
                return '@import ' + quote + (isProxyHost(absolute) ? proxyUrl(absolute) : absolute) + quote;
            });
    }
    function sanitizeHtml(html, siteOrigin) {
        var template = document.createElement('template');
        template.innerHTML = String(html || '');
        template.content.querySelectorAll('script,iframe,frame,frameset,object,embed,form,input,textarea,select,meta,base').forEach(function (node) { node.remove(); });
        template.content.querySelectorAll('*').forEach(function (node) {
            Array.from(node.attributes).forEach(function (attribute) {
                var name = attribute.name.toLowerCase();
                if (name.indexOf('on') === 0 || name === 'srcdoc' || name === 'formaction') node.removeAttribute(attribute.name);
            });
            ['href', 'src', 'poster', 'data'].forEach(function (name) {
                if (!node.hasAttribute(name)) return;
                var normalized = absoluteUrl(node.getAttribute(name), siteOrigin);
                if (normalized) node.setAttribute(name, normalized); else node.removeAttribute(name);
            });
            if (node.tagName === 'A') {
                node.setAttribute('target', '_blank');
                node.setAttribute('rel', 'noopener noreferrer');
            }
            if (node.tagName === 'LINK' && node.getAttribute('rel') === 'stylesheet') {
                var href = node.getAttribute('href');
                if (isProxyHost(href)) node.setAttribute('href', proxyUrl(href));
                else node.remove();
            }
            if (node.hasAttribute('style')) node.setAttribute('style', normalizeCss(node.getAttribute('style'), siteOrigin));
        });
        return template.content;
    }
    function injectContent(target, html, siteOrigin) {
        target.replaceChildren(sanitizeHtml(html, siteOrigin));
        document.querySelectorAll('style[data-ftml-injected]').forEach(function (node) { node.remove(); });
        target.querySelectorAll('style').forEach(function (node) {
            var style = document.createElement('style');
            style.dataset.ftmlInjected = '1';
            style.textContent = normalizeCss(node.textContent, siteOrigin);
            document.head.appendChild(style);
            node.remove();
        });
    }
    function initTabs(root) {
        root.querySelectorAll('wj-tabs').forEach(function (tabs) {
            if (tabs.dataset.previewReady) return;
            tabs.dataset.previewReady = '1';
            var buttons = Array.from(tabs.querySelectorAll(':scope > .wj-tabs-button-list > .wj-tabs-button'));
            var panels = Array.from(tabs.querySelectorAll(':scope > .wj-tabs-panel-list > .wj-tabs-panel'));
            buttons.forEach(function (button, index) {
                button.addEventListener('click', function () {
                    buttons.forEach(function (item, itemIndex) {
                        var selected = itemIndex === index;
                        item.setAttribute('aria-selected', selected ? 'true' : 'false');
                        item.setAttribute('tabindex', selected ? '0' : '-1');
                        if (panels[itemIndex]) panels[itemIndex].hidden = !selected;
                    });
                });
            });
        });
        root.querySelectorAll('.yui-navset').forEach(function (tabs) {
            if (tabs.dataset.previewReady) return;
            tabs.dataset.previewReady = '1';
            var items = Array.from(tabs.querySelectorAll(':scope > .yui-nav > li'));
            var panels = Array.from(tabs.querySelectorAll(':scope > .yui-content > div'));
            items.forEach(function (item, index) {
                var link = item.querySelector('a');
                if (!link) return;
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    items.forEach(function (entry, itemIndex) {
                        entry.classList.toggle('selected', itemIndex === index);
                        if (panels[itemIndex]) panels[itemIndex].style.display = itemIndex === index ? '' : 'none';
                    });
                });
            });
        });
    }
    function initCollapsibles(root) {
        root.querySelectorAll('.collapsible-block').forEach(function (block) {
            if (block.dataset.previewReady) return;
            block.dataset.previewReady = '1';
            block.querySelectorAll('.collapsible-block-link').forEach(function (link) {
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    var folded = block.querySelector('.collapsible-block-folded');
                    var unfolded = block.querySelector('.collapsible-block-unfolded');
                    if (!folded || !unfolded) return;
                    var opening = unfolded.style.display === 'none' || getComputedStyle(unfolded).display === 'none';
                    folded.style.display = opening ? 'none' : '';
                    unfolded.style.display = opening ? '' : 'none';
                });
            });
        });
    }
    function applyUpdate(message) {
        var title = String(message.title || 'FTML 预览');
        var siteOrigin = String(message.siteOrigin || 'https://www.wikidot.com');
        var pageContent = document.getElementById('page-content');
        document.title = title;
        document.getElementById('page-title').textContent = title;
        document.getElementById('site-title').querySelector('span').textContent = String(message.siteName || 'Wikidot 预览');
        document.getElementById('page-tags-list').textContent = Array.isArray(message.tags) && message.tags.length ? message.tags.join('、') : '无';
        document.body.className = message.device === 'mobile' ? 'preview-mobile' : message.device === 'tablet' ? 'preview-tablet' : 'preview-desktop';
        injectContent(pageContent, message.html, siteOrigin);
        initTabs(pageContent);
        initCollapsibles(pageContent);
    }
    window.addEventListener('message', function (event) {
        if (event.source !== parent) return;
        if (parentOrigin && event.origin !== parentOrigin) return;
        var message = parseMessage(event.data);
        if (!message || message.type !== 'ftml-update') return;
        applyUpdate(message);
    });
})();
