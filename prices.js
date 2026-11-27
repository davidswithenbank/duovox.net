/* 21 Nov 2026 (David: prices must follow admin). Every price tagged data-product="<store token>" is refreshed from the
   server's public price list, which admin publishes (and which Paddle is kept in step with). The prices written in the
   page stay as the fallback: if the list cannot be read, nothing changes. Values are written with textContent only.
   27 Nov 2026 (audit, David: "why would you leave this obvious error"): not only the bare amounts in the pop-up - the plan
   cards, "or $249.99/yr - 1 month free", "from $2.99", the Pay-As-You-Go lines and the press pages follow too.
   How: an element's data-product may list SEVERAL tokens ("a b c"); the n-th price in its text (and in each of its
   data-{price,annual,payg}-{usd,gbp,eur} attributes) becomes the n-th token's price. Only the numbers change, so the
   surrounding words - translated or not - stay as they are, and the currency shown is whatever the page already shows
   (i18n.js chose it), so this never decides the visitor's currency itself. Used by duovox.net and davidarthur.app. */
(function () {
    var URL_ = 'https://api.duovox.net/prices';
    var SYM = { '$': 'usd', '£': 'gbp', '€': 'eur' };
    var CUR = { usd: '$', gbp: '£', eur: '€' };
    var MONEY = /([$£€])(\d[\d,]*(?:\.\d+)?)/g;
    function ok(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v < 100000; }
    // the n-th amount in s -> the n-th product's price in that amount's own currency (cur forces one currency)
    function swap(s, prods, cur) {
        var n = 0;
        return s.replace(MONEY, function (all, sym) {
            var p = prods[n++], c = cur || SYM[sym];
            if (!p || !c || !ok(p[c])) return all;
            return CUR[c] + Number(p[c]).toFixed(2);
        });
    }
    function apply(list) {
        if (!list || typeof list !== 'object' || !list.products) return;
        var els = document.querySelectorAll('[data-product]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i], ids = (el.getAttribute('data-product') || '').split(/\s+/), prods = [], any = false;
            for (var k = 0; k < ids.length; k++) { prods.push(list.products[ids[k]] || null); any = any || !!prods[k]; }
            if (!any) continue;
            // the stored per-currency copies (i18n.js reads these when the currency changes)
            for (var a = 0; a < el.attributes.length; a++) {
                var at = el.attributes[a], m = /^data-(?:price|annual|payg)-(usd|gbp|eur)$/.exec(at.name);
                if (m) { var nv = swap(at.value, prods, m[1]); if (nv !== at.value) el.setAttribute(at.name, nv); }
            }
            // the visible text: every text node, counting amounts across them in order
            var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), t, n = 0, rest;
            while ((t = w.nextNode())) {
                var before = t.nodeValue, count = (before.match(MONEY) || []).length;
                if (!count) continue;
                rest = prods.slice(n, n + count); n += count;
                var after = swap(before, rest);
                if (after !== before) t.nodeValue = after;
            }
        }
    }
    try {
        if (!window.fetch) return;
        fetch(URL_, { credentials: 'omit', cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(apply)
            .catch(function () { /* fallback: the prices already in the page */ });
    } catch (e) { /* fallback */ }
})();
