/* 跨 file:// 页面传递存档的桥接层。
 *
 * 为什么要这东西
 * --------------
 * Firefox 默认 privacy.file_unique_origin = true，也就是**每个 html 文件算一个
 * 独立源**；而 Firefox 又会在跨源导航时把 window.name 清空（Chrome 不清）。
 * 于是 localStorage / sessionStorage / IndexedDB / cookie / window.name
 * 在 Firefox 下全都无法把存档从首页带到子页面 —— 表现就是首页导入成功后，
 * 点进洗练/装备页却提示"请先导入…"。
 *
 * 唯一还能跨源工作的通道是 postMessage，所以：
 *   · index.html 当「宿主」，常驻持有存档；
 *   · 点击站内链接时不跳转，改为在全屏 iframe 叠加层里承载子页面；
 *   · 子页面每次加载完，宿主把存档 postMessage 推过去；
 *   · 子页面写进**自己源下**的存储，然后自动重载一次，让页面原有逻辑能读到。
 *
 * 没有存档时本脚本完全不介入：链接照常跳转，行为与原始版本一致。
 */
(function () {
    'use strict';
    if (window.__yyjhPageBridge) return;
    window.__yyjhPageBridge = true;

    var HELLO = 'yyjh-bridge-hello';
    var SHARE = 'yyjh-bridge-share';
    var REVEAL_MS = 1200;

    var hosted = false;
    try { hosted = window.top !== window; } catch (e) { hosted = true; }

    /* ---------------- 子页面：报到 + 接收存档 ---------------- */

    if (hosted) {
        var revealed = false;
        var timer = null;

        var reveal = function () {
            if (revealed) return;
            revealed = true;
            try { document.documentElement.style.visibility = ''; } catch (e) { }
            try { document.documentElement.style.opacity = ''; } catch (e) { }
        };

        // 先把兜底定时器挂上，再隐藏；这样即使后面抛异常也不会一直白屏
        try { timer = setTimeout(reveal, REVEAL_MS); } catch (e) { reveal(); }
        try {
            document.documentElement.style.visibility = 'hidden';
        } catch (e) { reveal(); }

        window.addEventListener('message', function (ev) {
            var d = ev && ev.data;
            if (!d || d.type !== SHARE || typeof d.d !== 'string') return;

            var had = false;
            try { had = typeof loadShareStore === 'function' && !!loadShareStore(); } catch (e) { }

            if (typeof shareStoreApplyRaw !== 'function') { reveal(); return; }
            var applied = false;
            try { applied = shareStoreApplyRaw(d.d, d.m); } catch (e) { }
            if (!applied) { reveal(); return; }

            if (had) { reveal(); return; }   // 本页面已经有存档了，无需重载

            // 首次拿到存档：重载一次让页面自身逻辑读到它。
            // 用 sessionStorage 记一笔，万一写入没生效也不会无限重载。
            var guard = 'yyjh_bridge_' + String(d.k || 'k');
            var done = false;
            try {
                done = sessionStorage.getItem(guard) === '1';
                sessionStorage.setItem(guard, '1');
            } catch (e) { }
            if (done) { reveal(); return; }

            try { reveal(); location.reload(); } catch (e) { reveal(); }
        });

        var hello = function () {
            try { window.parent.postMessage({ type: HELLO, href: location.href }, '*'); } catch (e) { }
        };
        hello();
        try {
            document.addEventListener('DOMContentLoaded', hello);
            window.addEventListener('load', hello);
        } catch (e) { }
        return;
    }

    /* ---------------- 宿主页面：拦截站内链接 ---------------- */

    var overlay = null;
    var frame = null;
    var tip = null;
    var rootHref = null;
    try { rootHref = new URL('./index.html', location.href).href; } catch (e) { }

    var normalize = function (u) {
        try {
            var x = new URL(u, location.href);
            return x.pathname;      // 只比路径：不同源的同一份文件也算同一个首页
        } catch (e) { return ''; }
    };

    var canHost = function () {
        try { return typeof shareStoreRaw === 'function' && !!shareStoreRaw(); } catch (e) { return false; }
    };

    // window.YYJH_HOST_BASE（调试用）：把子页面指向另一个源，
    // 用来在 http 环境下模拟 Firefox 的 file:// 跨源情况。
    var moduleUrl = function (href) {
        var abs;
        try { abs = new URL(href, location.href); } catch (e) { return href; }
        var base = window.YYJH_HOST_BASE;
        if (!base) return abs.href;
        try {
            var rootDir = new URL('./', location.href);
            var rel = abs.pathname.slice(rootDir.pathname.length);
            return new URL(rel, base).href;
        } catch (e) { return abs.href; }
    };

    var postShare = function () {
        if (!frame || !frame.contentWindow) return;
        var raw = null;
        try { raw = shareStoreRaw(); } catch (e) { }
        if (!raw) return;
        try {
            frame.contentWindow.postMessage({
                type: SHARE,
                d: raw.d,
                m: raw.m,
                k: raw.d.length + '_' + raw.m.length,
            }, '*');
        } catch (e) { }
    };

    var closeOverlay = function () {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        frame = null;
        tip = null;
        try { document.documentElement.style.overflow = ''; } catch (e) { }
    };

    var openOverlay = function (url) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'yyjhHostOverlay';
            overlay.setAttribute('style', [
                'position:fixed', 'inset:0', 'z-index:2147483000',
                'display:flex', 'flex-direction:column', 'background:#fff',
            ].join(';'));

            var bar = document.createElement('div');
            bar.setAttribute('style', [
                'flex:0 0 auto', 'display:flex', 'align-items:center', 'gap:12px',
                'padding:7px 12px', 'background:#22252b', 'color:#e9e9ea',
                'font:13px/1.5 system-ui,-apple-system,"Microsoft YaHei",sans-serif',
            ].join(';'));

            var back = document.createElement('button');
            back.type = 'button';
            back.textContent = '\u2190 返回存档页';
            back.setAttribute('style', [
                'cursor:pointer', 'border:1px solid #4a4f59', 'background:#2f333b',
                'color:#e9e9ea', 'border-radius:6px', 'padding:4px 12px', 'font:inherit',
            ].join(';'));
            back.addEventListener('click', closeOverlay);

            tip = document.createElement('span');
            tip.id = 'yyjhHostTip';
            tip.setAttribute('style', 'opacity:.7');

            bar.appendChild(back);
            bar.appendChild(tip);

            frame = document.createElement('iframe');
            frame.id = 'yyjhHostFrame';
            frame.setAttribute('style', 'flex:1 1 auto;width:100%;border:0;background:#fff');
            frame.setAttribute('allow', 'clipboard-write');
            frame.addEventListener('load', postShare);

            overlay.appendChild(bar);
            overlay.appendChild(frame);
            document.body.appendChild(overlay);
            try { document.documentElement.style.overflow = 'hidden'; } catch (e) { }
        }
        frame.src = url;
    };

    window.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.type !== HELLO) return;
        if (frame && ev.source && ev.source !== frame.contentWindow) return;

        var href = String(d.href || '');
        if (rootHref && normalize(href) === normalize(rootHref)) { closeOverlay(); return; }

        if (tip) {
            var parts = href.split('/').filter(Boolean);
            var file = parts.slice(-2).join('/');   // 5 个子页面都叫 index.html，取两级才看得出是哪个
            tip.textContent = '\u5b58\u6863\u5df2\u901a\u8fc7\u672c\u673a\u6865\u63a5\u4f20\u5165 \u00b7 ' + file;
        }
        postShare();
    });

    document.addEventListener('click', function (ev) {
        if (!ev || ev.defaultPrevented || ev.button !== 0) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

        var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (!a) return;
        if (a.target && a.target !== '_self') return;
        if (a.hasAttribute('download')) return;

        var raw = a.getAttribute('href') || '';
        if (/^(https?:|mailto:|tel:|javascript:|data:|#)/i.test(raw)) return;
        if (!/\.html?(#|$)/i.test(raw)) return;
        if (!canHost()) return;            // 没有存档可带，照常跳转

        ev.preventDefault();
        openOverlay(moduleUrl(raw));
    }, true);

    try { window.addEventListener('pagehide', closeOverlay); } catch (e) { }
})();
