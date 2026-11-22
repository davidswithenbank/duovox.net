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

    fetch(API + "/offers?set=web&lang=" + encodeURIComponent(lang), { mode: "cors", credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            var list = d && Array.isArray(d.offers) ? d.offers : [];
            // The card's wording is English (the server does not translate it yet), so it shows on the English pages only.
            if (lang.indexOf("en") !== 0) return;
            var o = list.filter(function (x) { return x && ID_RE.test(x.id || ""); })[0];
            if (!o) return;
            var v = "?v=" + encodeURIComponent(String(d.cards || ""));
            return Promise.all([
                load("link", { rel: "stylesheet", href: API + "/offers/cards.css" + v }),
                load("script", { src: API + "/offers/cards.js" + v })
            ]).then(function () {
                if (typeof window.renderOfferCard !== "function") return;
                var variant = o.variant === "b" ? "b" : "a";
                var card = window.renderOfferCard(o);
                var cta = card.querySelector(".oc-cta");
                if (cta) {
                    try {
                        var u = new URL(cta.getAttribute("href"), location.href);
                        if (u.searchParams.get("offer")) { u.searchParams.set("v", variant); cta.href = u.toString(); }
                    } catch (e) { /* keep the server's link */ }
                    cta.addEventListener("click", function () { send(o.id, variant, "click"); });
                }
                host.replaceChildren(card);
                host.hidden = false;
                send(o.id, variant, "shown");   // once per page view (Admin, 22 Nov)
            });
        })
        .catch(function () { /* no offer shown: the page is as it always was */ });
})();
