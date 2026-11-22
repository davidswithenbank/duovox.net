/* Special offers on duovox.net (22 Nov 2026). The admin sets the offers; the server (api.duovox.net/offers?set=web) picks the
   ones live now for this visitor (dates, country, language, A/B style). The card itself is the Worker's own renderer
   (/offers/cards.js + .css), so the site shows exactly what the admin previewed. No offer = nothing is shown, the page is unchanged.
   On buy.html, ?offer=<id>&v=<a|b> is carried on to the checkout links (attribution only: the price is always Paddle's). */
(function () {
    "use strict";
    var API = "https://api.duovox.net";
    var ID_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

    // 1. buy.html?offer=<id>: pass the offer on to every checkout link
    try {
        var q = new URLSearchParams(location.search), oid = q.get("offer") || "", ov = q.get("v") === "b" ? "b" : "a";
        if (ID_RE.test(oid)) {
            var links = document.querySelectorAll('a[href^="' + API + '/buy/"]');
            for (var i = 0; i < links.length; i++) {
                var u = new URL(links[i].href);
                u.searchParams.set("offer", oid); u.searchParams.set("v", ov);
                links[i].href = u.toString();
            }
        }
    } catch (e) { /* old browser: links stay as they are */ }

    // 2. show the live offer, if there is one
    var host = document.getElementById("site-offer");
    if (!host || !window.fetch) return;
    var lang = (document.documentElement.lang || "en").toLowerCase();

    function send(id, variant, kind) {
        try {
            fetch(API + "/offers/event", { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: id, variant: variant, kind: kind }) }).catch(function () {});
        } catch (e) { /* not counted */ }
    }
    function load(tag, attrs) {
        return new Promise(function (ok, fail) {
            var el = document.createElement(tag);
            for (var k in attrs) el.setAttribute(k, attrs[k]);
            el.onload = ok; el.onerror = fail;
            document.head.appendChild(el);
        });
    }

    // ---- the card on the language pages (22 Nov 2026, David: "Yes") ----
    // The server sends English. The wording lives in <template id="offer-i18n"> on this page, translated by the site build
    // like every other line. A known offer type uses its translated wording (David's own English text would be the only
    // English on the page); a "custom" offer keeps what he typed. The footnote is always kept as typed: it may carry a condition.
    var tplEl = document.getElementById("offer-i18n");
    function T(k) {
        var e = tplEl && tplEl.content ? tplEl.content.querySelector('[data-i18n="' + k + '"]') : null;
        return e ? e.textContent : "";
    }
    function fill(s, m) { return String(s).replace(/\{(n|p|d)\}/g, function (_, k) { return m[k]; }); }
    var plural = (function () { try { var r = new Intl.PluralRules(lang); return function (n) { return r.select(n); }; } catch (e) { return function (n) { return n === 1 ? "one" : "other"; }; } })();
    function counted(base, n) {
        var c = plural(n), s = T(base + "." + c) || T(base + "." + (n === 1 ? "one" : "other"));
        return fill(s, { n: n });
    }
    function plan(t) { return T("offer.ui.plan." + String(t || "").toLowerCase()) || t || ""; }
    function pct(price, was) { price = Number(price); was = Number(was); return (was > price && price > 0) ? Math.floor((1 - price / was) * 100) : 0; }
    function rangeSave(o) { return (o.packs || []).reduce(function (m, p) { return Math.max(m, pct(p.price, p.was_price)); }, 0); }
    function localise(o) {
        var r = Object.assign({}, o), hours = Number(o.hours) || 0, bonus = Number(o.bonus_hours) || 0;
        var save = o.mechanic === "range" ? rangeSave(o) : pct(o.price, o.was_price);
        var val = { hours: hours ? String(hours) : "", tier: plan(o.tier), save: save ? String(save) : "", bonus: bonus ? counted("offer.ui.hours", bonus) : "" };
        if (o.type && o.type !== "custom") {
            ["eyebrow", "headline", "subhead", "badge", "cta"].forEach(function (f) {
                var s = T("offer.t." + o.type + "." + f), ok = true;
                if (!s) return;
                s = s.replace(/\{(hours|tier|save|bonus|pack)\}/g, function (_, k) { var x = val[k] || ""; if (!x) ok = false; return x; });
                if (ok) r[f] = s;   // a value missing (e.g. no saving to quote): the card's own English line stays
            });
        }
        if (!r.headline) r.headline = T("offer.ui.special") || "";
        if (!r.cta) r.cta = T("offer.ui.buy") || "";
        if (hours) r.pack = counted("offer.ui.hours", hours) + (o.tier ? " · " + plan(o.tier) : "");
        if (Array.isArray(o.packs)) r.packs = o.packs.map(function (p) { return Object.assign({}, p, { label: counted("offer.ui.hours", Number(p.hours) || 0) }); });
        return r;
    }
    function localiseCard(card, o) {
        var mech = /^(bonus|range|code)$/.test(o.mechanic) ? o.mechanic : "discount", bonus = Number(o.bonus_hours) || 0;
        var save = card.querySelector(".oc-save");
        if (save && !save.hidden) {
            var s = mech === "range" ? fill(T("offer.ui.saveupto"), { n: rangeSave(o) })
                  : mech === "bonus" && bonus ? counted("offer.ui.bonusfree", bonus)
                  : fill(T("offer.ui.save"), { n: pct(o.price, o.was_price) });
            if (s) save.textContent = s;
        }
        var per = card.querySelector(".oc-per");
        if (per && !per.hidden) {
            var m = /^(.*?) an hour( with the bonus)?$/.exec(per.textContent || "");
            var tp = m && T(m[2] ? "offer.ui.perhourbonus" : "offer.ui.perhour");
            if (tp) per.textContent = fill(tp, { p: m[1] });
        }
        var code = card.querySelector(".oc-code > span"); if (code && T("offer.ui.code")) code.textContent = T("offer.ui.code");
        var copy = card.querySelector(".oc-copy"); if (copy && T("offer.ui.copy")) copy.textContent = T("offer.ui.copy");
        var h = card.querySelector(".oc-headline"); if (h) card.setAttribute("aria-label", h.textContent.trim());
        // The countdown redraws itself every second, and Copy turns into "Copied": put the translation back each time.
        var swap = { "Ends in": T("offer.ui.endsin"), "Copied": T("offer.ui.copied") };
        var fix = function () {
            var t = card.querySelector(".oc-timer > span");
            if (t && swap[t.textContent] && t.textContent !== swap[t.textContent]) t.textContent = swap[t.textContent];
            if (copy && swap[copy.textContent]) copy.textContent = swap[copy.textContent];
        };
        fix();
        if (window.MutationObserver) new MutationObserver(fix).observe(card, { subtree: true, childList: true });
    }

    // ---- where, which shape and how big (set per offer in the admin's Website editor; 22 Nov 2026, David) ----
    // web_layout: landscape (the app card's shape) | portrait. web_size: small | medium | large.
    // web_place: top (under the opening section) | pricing (above the plans; on buy.html: the top) | after-pricing | bottom.
    // A landscape card needs ~600px: on a narrower screen (phones) it is shown in portrait instead.
    var SIZES = { small: 0.8, medium: 0.9, large: 1 };
    function layout(o) {
        var z = SIZES[o.web_size] || SIZES.medium, room = Math.max(280, (document.documentElement.clientWidth || 375) - 32);
        var landscape = o.web_layout !== "portrait" && 600 * z <= room;
        return { landscape: landscape, zoom: Math.min(z, room / (landscape ? 600 : 360)) };
    }
    var home0 = { parent: host.parentNode, next: host.nextSibling };   // where the page put it ("pricing")
    function place(where) {
        var page = /buy\.html$/.test(location.pathname) ? "buy" : "home";
        var ANCHOR = {
            home: { top: "#demo", "after-pricing": "#faq", bottom: ".disclaimer-section" },
            buy: { "after-pricing": "footer.footer", bottom: "footer.footer" }
        };
        var sel = (ANCHOR[page] || {})[where], a = sel && document.querySelector(sel);
        if (a && a.parentNode) { a.parentNode.insertBefore(host, a); host.classList.add("site-offer-out"); }
        else { home0.parent.insertBefore(host, home0.next); host.classList.remove("site-offer-out"); }
    }

    var assets = null;
    function loadCards(ver) {
        if (!assets) {
            var v = "?v=" + encodeURIComponent(String(ver || ""));
            assets = Promise.all([
                load("link", { rel: "stylesheet", href: API + "/offers/cards.css" + v }),
                load("script", { src: API + "/offers/cards.js" + v })
            ]);
        }
        return assets;
    }
    // preview (the admin's Website editor, below): nothing is counted and the button goes nowhere.
    function show(o, preview) {
        if (typeof window.renderOfferCard !== "function") return;
        var variant = o.variant === "b" ? "b" : "a";
        var en = lang.indexOf("en") === 0;
        var lay = layout(o);
        var shown = Object.assign({}, en ? o : localise(o), lay.landscape ? { set: "app", dismissible: false } : {});
        var card = window.renderOfferCard(shown);
        card.style.zoom = String(lay.zoom);
        place(o.web_place);
        if (!en) localiseCard(card, o);
        var cta = card.querySelector(".oc-cta");
        if (cta && preview) {
            cta.removeAttribute("href");
            cta.addEventListener("click", function (e) { e.preventDefault(); });
        } else if (cta) {
            try {
                var u = new URL(cta.getAttribute("href"), location.href);
                if (u.searchParams.get("offer")) { u.searchParams.set("v", variant); cta.href = u.toString(); }
            } catch (e) { /* keep the server's link */ }
            cta.addEventListener("click", function () { send(o.id, variant, "click"); });
        }
        host.replaceChildren(card);   // no "Preview" label (David, 22 Nov); the postMessage gate below is the protection
        host.hidden = false;
        if (preview) host.scrollIntoView({ block: "center" });
        else send(o.id, variant, "shown");   // once per page view (Admin, 22 Nov)
    }
    // The admin frames this page (URL + #offer-preview) and posts the draft to it. Only a message from the admin origin, sent by
    // the frame's own parent, is accepted: a link on its own shows nothing, so nobody can make duovox.net show a made-up offer.
    if (/[#&]offer-preview\b/.test(location.hash) && window.parent !== window) {
        window.addEventListener("message", function (ev) {
            var d = ev.data;
            if (ev.origin !== API || ev.source !== window.parent || !d || d.type !== "duovox-offer-preview") return;
            if (!d.offer || typeof d.offer !== "object") return;
            loadCards("preview").then(function () { show(d.offer, true); });   // each new message redraws it (no reload)
        });
        try { window.parent.postMessage({ type: "duovox-offer-preview-ready" }, API); } catch (e) { /* not framed by the admin */ }
        return;
    }

    fetch(API + "/offers?set=web&lang=" + encodeURIComponent(lang), { mode: "cors", credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            var list = d && Array.isArray(d.offers) ? d.offers : [];
            var o = list.filter(function (x) { return x && ID_RE.test(x.id || ""); })[0];
            if (!o) return;
            return loadCards(d.cards).then(function () { show(o, false); });
        })
        .catch(function () { /* no offer shown: the page is as it always was */ });
})();
