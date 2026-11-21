/* 21 Nov 2026 (David: prices must follow admin). Every price tagged data-product="<store token>" is refreshed from the
   server's public price list, which admin publishes (and which Paddle is kept in step with). The prices written in the
   page stay as the fallback: if the list cannot be read, nothing changes. Values are written with textContent only.
   The currency shown is whichever of the element's data-price-{usd,gbp,eur} values matches its current text (i18n.js
   chose it), so this never decides the visitor's currency itself. */
(function () {
    var URL_ = 'https://api.duovox.net/prices';
    var SYM = { usd: '$', gbp: '£', eur: '€' };
    function fmt(cur, v) { return SYM[cur] + Number(v).toFixed(2); }
    function shownCurrency(el) {
        var t = (el.textContent || '').trim();
        for (var c in SYM) { if ((el.getAttribute('data-price-' + c) || '').trim() === t) return c; }
        return null;
    }
    function apply(list) {
        if (!list || typeof list !== 'object' || !list.products) return;
        var els = document.querySelectorAll('[data-product]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i], p = list.products[el.getAttribute('data-product')];
            if (!p) continue;
            var cur = shownCurrency(el);
            for (var c in SYM) {
                var v = p[c];
                if (typeof v === 'number' && isFinite(v) && v > 0 && v < 100000) el.setAttribute('data-price-' + c, fmt(c, v));
            }
            if (cur && el.getAttribute('data-price-' + cur)) el.textContent = el.getAttribute('data-price-' + cur);
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
