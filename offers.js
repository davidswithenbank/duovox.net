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
        var e = null;
        try { e = tplEl && tplEl.content ? tplEl.content.querySelector('[data-i18n="' + k + '"]') : null; }
        catch (x) { /* a key the selector cannot hold: no translation, the English stays */ }
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
                else if (f === "subhead" && o.mechanic === "range") {
                    // a sale on every pack has no single number of hours: use the translated "Every {tier} pack for less" line
                    // (David, 23 Nov) - dropping {hours} from the type's own line breaks the grammar in some languages
                    var rs = T("offer.t.range.subhead");
                    if (rs && (val.tier || rs.indexOf("{tier}") < 0)) r[f] = rs.replace(/\{tier\}/g, val.tier);
                }
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
            if (copy && swap[copy.textContent] && copy.textContent !== swap[copy.textContent]) copy.textContent = swap[copy.textContent];   // guard: an equal write still fires the observer (endless loop)
        };
        fix();
        if (window.MutationObserver) new MutationObserver(fix).observe(card, { subtree: true, childList: true });
    }

    // ---- where, which shape and how big (set per offer in the admin's Website editor; 22 Nov 2026, David) ----
    // web_layout: landscape (the app card's shape) | portrait. web_size: small | medium | large.
    // web_place: top (under the opening section) | pricing (above the plans; on buy.html: the top) | after-pricing | bottom.
    // A landscape card needs ~600px: on a narrower screen (phones) it is shown in portrait instead.
    // web_pair: another website offer's id - the two are shown side by side (David, 22 Nov).
    var SIZES = { small: 0.8, medium: 0.9, large: 1 };
    var GAP = 24;
    function room() { return Math.max(280, (document.documentElement.clientWidth || 375) - 32); }
    function zoomOf(o) { return SIZES[o.web_size] || SIZES.medium; }
    function widthOf(landscape, z) { return (landscape ? 600 : 360) * z; }
    function layout(o) {
        var z = zoomOf(o), r = room();
        var landscape = o.web_layout !== "portrait" && widthOf(true, z) <= r;
        return { landscape: landscape, zoom: Math.min(z, r / (landscape ? 600 : 360)) };
    }
    // Two offers side by side (David, 22 Nov: web_pair): each keeps its own shape and size if both fit in one row; else both in
    // portrait if that fits; else one under the other, each as it would be alone.
    function pairLayout(a, b) {
        var r = room(), za = zoomOf(a), zb = zoomOf(b);
        var la = a.web_layout !== "portrait", lb = b.web_layout !== "portrait";
        if (widthOf(la, za) + GAP + widthOf(lb, zb) <= r) return { row: true, lays: [{ landscape: la, zoom: za }, { landscape: lb, zoom: zb }] };
        if (widthOf(false, za) + GAP + widthOf(false, zb) <= r) return { row: true, lays: [{ landscape: false, zoom: za }, { landscape: false, zoom: zb }] };
        return { row: false, lays: [layout(a), layout(b)] };
    }
    // ---- spots (23 Nov 2026, David's redesigned editor: the page has four spots, every one can hold an offer or two) ----
    // The page's own #site-offer is the "pricing" spot; the others get their own box before their anchor.
    function spotKey(where) {
        var page = /buy\.html$/.test(location.pathname) ? "buy" : "home";
        var ANCHOR = {
            home: { top: "#demo", "after-pricing": "#faq", bottom: ".disclaimer-section" },
            buy: { "after-pricing": "footer.footer", bottom: "footer.footer" }
        };
        var sel = (ANCHOR[page] || {})[where];
        return sel && document.querySelector(sel) ? sel : "";   // "" = where the page put #site-offer
    }
    var extraHosts = [];
    function hostFor(key, made) {
        if (!key) return host;
        if (made[key]) return made[key];
        var a = document.querySelector(key), h = document.createElement("div");
        h.className = "site-offer site-offer-out";
        a.parentNode.insertBefore(h, a);
        extraHosts.push(h);
        return (made[key] = h);
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
    function build(o, lay, preview) {
        var variant = o.variant === "b" ? "b" : "a";
        // "Translate into every app and site language" unticked in the admin: show it exactly as David typed it
        var en = lang.indexOf("en") === 0 || o.auto_translate === false;
        var shown = Object.assign({}, en ? o : localise(o), lay.landscape ? { set: "app", dismissible: false } : {});
        var card = window.renderOfferCard(shown);
        card.style.zoom = String(lay.zoom);
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
        return card;
    }
    // groups: [[offer] or [offer, partner]], each drawn at its first offer's spot. Groups landing on the same spot (buy.html has
    // only two) share it in one wrapping row.
    var shownIds = Object.create(null);   // NOT "counted": that name is the wording function above
    function show(groups, preview, quiet) {
        if (typeof window.renderOfferCard !== "function") return;
        extraHosts.forEach(function (h) { h.remove(); });
        extraHosts = [];
        host.replaceChildren(); host.hidden = true;
        var made = {}, perHost = [], first = null;
        groups.forEach(function (g) {
            var h = hostFor(spotKey(g[0].web_place), made);
            var e = perHost.filter(function (x) { return x.h === h; })[0];
            if (!e) perHost.push(e = { h: h, offers: [] });
            e.offers = e.offers.concat(g);
        });
        perHost.forEach(function (e) {
            var os = e.offers;
            var pl = os.length === 2 ? pairLayout(os[0], os[1])
                   : { row: os.length > 2, lays: os.map(layout) };
            var cards = os.map(function (o, i) { return build(o, pl.lays[i], preview); });
            e.h.classList.toggle("site-offer-pair", os.length > 1);
            e.h.classList.toggle("site-offer-row", os.length > 1 && pl.row);
            e.h.replaceChildren.apply(e.h, cards);   // no "Preview" label (David, 22 Nov); the postMessage gate is the protection
            e.h.hidden = false;
            if (!first) first = e.h;
            if (!preview && !quiet) os.forEach(function (o) {   // once per OFFER per view: one offer in two spots counts once
                if (shownIds[o.id]) return;
                shownIds[o.id] = true;
                send(o.id, o.variant === "b" ? "b" : "a", "shown");
            });
        });
        return first;
    }
    // A list of offers -> groups: by spot in list order; each spot's first offer + the one it names in web_pair (either way;
    // the server pairs same-spot offers itself). A partner is drawn only once.
    // The limit is per BOX, not per spot name: buy.html has two boxes for four spots (top = pricing, after-pricing = bottom), so
    // two single offers there share a box side by side, never more than two, and never the same offer twice in one box.
    function boxOf(o) { return spotKey(o.web_place) || "pricing"; }
    function groupOffers(list) {
        var used = [], groups = [], inBox = {};
        list.forEach(function (o) {
            if (used.indexOf(o) >= 0) return;
            var box = boxOf(o), have = inBox[box] || [];
            if (have.length >= 2 || have.indexOf(o.id) >= 0) return;
            var p = have.length ? null : list.filter(function (x) {
                return x !== o && used.indexOf(x) < 0 && x.id !== o.id && (x.id === o.web_pair || x.web_pair === o.id)
                    && boxOf(x) === box;   // the same offer may be in several spots: partner from THIS box only
            })[0];
            used.push(o); if (p) used.push(p);
            inBox[box] = have.concat(p ? [o.id, p.id] : [o.id]);
            groups.push(p ? [o, p] : [o]);
        });
        return groups;
    }
    // The same limit for the admin preview, so the preview never shows a card the live page would leave out.
    function capPerBox(groups) {
        var inBox = {};
        return groups.map(function (g) {
            var box = boxOf(g[0]), have = inBox[box] || (inBox[box] = []);
            return g.filter(function (o) {
                if (have.length >= 2 || (o.id && have.indexOf(o.id) >= 0)) return false;
                have.push(o.id || {});
                return true;
            });
        }).filter(function (g) { return g.length; });
    }
    var lastPreview = null, lastLive = null, resizeT = 0;
    window.addEventListener("resize", function () {   // the shape follows the window (a redraw is not counted again)
        clearTimeout(resizeT);
        resizeT = setTimeout(function () { if (lastPreview) show(lastPreview, true); else if (lastLive) show(lastLive, false, true); }, 150);
    });
    // The admin frames this page (URL + #offer-preview) and posts the draft to it. Only a message from the admin origin, sent by
    // the frame's own parent, is accepted: a link on its own shows nothing, so nobody can make duovox.net show a made-up offer.
    if (/[#&]offer-preview\b/.test(location.hash) && window.parent !== window) {
        window.addEventListener("message", function (ev) {
            var d = ev.data;
            if (ev.origin !== API || ev.source !== window.parent || !d || d.type !== "duovox-offer-preview") return;
            if (!d.offer || typeof d.offer !== "object") return;
            var draft = [d.offer];
            if (d.pair && typeof d.pair === "object") draft.push(d.pair);
            var others = (Array.isArray(d.others) ? d.others : []).filter(function (x) { return x && typeof x === "object"; });
            // the other spots: two in the same spot side by side
            var bySpot = {}, order = [];
            others.forEach(function (x) {
                var k = spotKey(x.web_place) || "pricing";
                if (!bySpot[k]) { bySpot[k] = []; order.push(k); }
                if (bySpot[k].length < 2) bySpot[k].push(x);
            });
            var groups = capPerBox([draft].concat(order.map(function (k) { return bySpot[k]; })));
            loadCards("preview").then(function () {
                lastPreview = groups;
                var h = show(groups, true);
                if (h) h.scrollIntoView({ block: "center" });   // the draft's spot
            });
        });
        try { window.parent.postMessage({ type: "duovox-offer-preview-ready" }, API); } catch (e) { /* not framed by the admin */ }
        return;
    }

    fetch(API + "/offers?set=web&lang=" + encodeURIComponent(lang), { mode: "cors", credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            var list = (d && Array.isArray(d.offers) ? d.offers : []).filter(function (x) { return x && ID_RE.test(x.id || ""); });
            var groups = groupOffers(list);
            if (!groups.length) return;
            return loadCards(d.cards).then(function () { lastLive = groups; show(groups, false); });
        })
        .catch(function () { /* no offer shown: the page is as it always was */ });
})();
