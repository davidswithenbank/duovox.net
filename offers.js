/* Special offers on duovox.net (22 Nov 2026) - and, since 27 Nov 2026, CCTV Converter's on davidarthur.app/cctvconverter/. The admin sets the offers; the server (api.duovox.net/offers?set=web) picks the
   ones live now for this visitor (dates, country, language, A/B style). The card itself is the Worker's own renderer
   (/offers/cards.js + .css), so the site shows exactly what the admin previewed. No offer = nothing is shown, the page is unchanged.
   On buy.html, ?offer=<id>&v=<a|b> is carried on to the checkout links (attribution only: the price is always Paddle's). */
(function () {
    "use strict";
    var API = "https://api.duovox.net";
    var ID_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
    // The server's offer packs (proxy/src/offers.ts OFFER_PACKS, DuoVox only) -> the checkout token on api.duovox.net/buy/<token>
    var PACK_TOKEN = { "std-1": "duovox_standard_payg_1", "std-10": "duovox_standard_payg_10", "std-25": "duovox_standard_payg_25",
        "pro-1": "duovox_professional_payg_1", "pro-10": "duovox_professional_payg_10", "pro-25": "duovox_professional_payg_25",
        "std-monthly": "duovox_standard_monthly", "pro-monthly": "duovox_professional_monthly" };

    // 1. buy.html?offer=<id>: pass the offer on to every checkout link
    try {
        var q = new URLSearchParams(location.search), oid = q.get("offer") || "", ov = q.get("v") === "b" ? "b" : "a";
        if (ID_RE.test(oid)) {
            var links = document.querySelectorAll('a[href^="' + API + '/buy/"]');
            for (var i = 0; i < links.length; i++) {
                var u = new URL(links[i].href);
                u.searchParams.set("offer", oid); u.searchParams.set("v", ov);
                // 23 Nov 2026 (Worker item 11.4): the page language, so an offer limited to some languages is honoured at checkout
                // (the same lower-case code this page sends to /offers?lang=).
                u.searchParams.set("lang", (document.documentElement.lang || "en").toLowerCase());
                links[i].href = u.toString();
            }
        }
    } catch (e) { /* old browser: links stay as they are */ }

    // 2. show the live offer, if there is one
    var host = document.getElementById("site-offer");
    if (!host || !window.fetch) return;
    var lang = (document.documentElement.lang || "en").toLowerCase();
    // 27 Nov 2026 (David: "Yes, make it show the offers"): davidarthur.app/cctvconverter/ shows CCTV Converter's website offers -
    // its #site-offer carries data-offer-product="cctv". Every other page is DuoVox's. The server never mixes the two products.
    var CCTV = host.getAttribute("data-offer-product") === "cctv";

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
    function mkPlural() { try { var r = new Intl.PluralRules(lang); return function (n) { return r.select(n); }; } catch (e) { return function (n) { return n === 1 ? "one" : "other"; }; } }
    var plural = mkPlural();
    function counted(base, n) {
        var c = plural(n), s = T(base + "." + c) || T(base + "." + (n === 1 ? "one" : "other"));
        return fill(s, { n: n });
    }
    function plan(t) { return T("offer.ui.plan." + String(t || "").toLowerCase()) || t || ""; }
    function pct(price, was) { price = Number(price); was = Number(was); return (was > price && price > 0) ? Math.floor((1 - price / was) * 100) : 0; }
    function rangeSave(o) { return (o.packs || []).reduce(function (m, p) { return Math.max(m, pct(p.price, p.was_price)); }, 0); }
    // ---- 26 Nov 2026 (Worker item 21): the card's DEFAULT words fitted to the offer - a COPY of offerHours + fitWords from the
    // Worker's renderer (proxy/src/offerAssets.ts). Keep them identical: _claude_tools/website_offers/fit_variants.mjs lists
    // what they produce, offer_i18n_block.py puts those texts on the page (offer.fit.*), translate_missing translates them.
    function offerHours(r) {
      var end = Date.parse(r.ends_at || ""), start = Date.parse(r.starts_at || "");
      if (!isFinite(end)) return Infinity;
      if (!isFinite(start)) start = Date.now();
      return Math.max(0, (end - start) / 3600000);
    }
    function fitWords(s, r, save, field) {
      var mech = r.mechanic, hrs = offerHours(r);
      if (mech === "bonus") {
        // a bonus is the usual price plus free hours: say what is free, never "save" or "for less"
        s = s.replace(/[Ss]ave \{save\}% on (\{hours\} \{tier\} hours)/g, function (m) { return (m[0] === "S" ? "Get" : "get") + " {bonus} free with {hours} {tier} hours"; })
          .replace(/[Ss]ave \{save\}%/g, function (m) { return (m[0] === "S" ? "Get" : "get") + " {bonus} free"; })
          .replace(/(\{hours\} (?:\{tier\}|Professional) hours)(.*?),? for less/g, "$1 + {bonus} free$2")
          .replace(/, \*for less\*/g, ", *with free hours*").replace(/ for less/g, " with free hours")
          .replace(/^Top up and save$/, "Top up and get more");
        if (/\{save\}|\bsave\b/i.test(s)) s = field === "subhead" ? "Get {bonus} free with {hours} {tier} hours." : s.replace(/\bsave\b/gi, "get more");
        // the subhead always names what is free ("10 Standard hours to keep the conversations going" says nothing of it)
        if (field === "subhead" && !/\{bonus\}/.test(s) && /\{hours\} \{tier\} hours/.test(s)) s = s.replace("{hours} {tier} hours", "{hours} {tier} hours + {bonus} free");
      } else if (mech === "range") {
        // a sale on every pack: no single pack size, and "up to" when the packs' savings differ
        var p = (r.packs || []).map(function (x) { return pct(x.price, x.was_price); });
        var same = p.length > 0 && p.every(function (x) { return x === p[0]; });
        s = s.replace(/\{hours\} \{tier\} hours/g, "every {tier} pack").replace(/\{hours\} Professional hours/g, "every Professional pack")
          .replace(/Take every/g, "Take any").replace(/with every/g, "with any");
        if (!same) s = s.replace(/([Ss]ave) \{save\}%/g, "$1 up to {save}%");
      }
      // time claims only when they are true for this offer's own dates
      if (hrs > 12) s = s.replace(/, for a few hours only\./, ", for a limited time.");
      if (hrs > 36) s = s.replace(/^One day only: (.)/, function (_, c) { return c.toUpperCase(); }).replace(/^Today only$/, "Limited time");
      if (hrs > 72) s = s.replace(/ · Ends soon$/, "");
      if (hrs > 96) s = s.replace(/ this weekend\./, ".");
      return s;
    }
    // offer.fit.* lines carry their English in data-en (generated): English text -> this page's translation
    var fitMap = null;
    function FIT(en) {
        if (!fitMap) {
            fitMap = Object.create(null);
            try {
                var els = tplEl && tplEl.content ? tplEl.content.querySelectorAll("[data-en]") : [];
                for (var i = 0; i < els.length; i++) fitMap[els[i].getAttribute("data-en")] = els[i].textContent;
            } catch (e) { /* no template: English stays */ }
        }
        return fitMap[en] || "";
    }
    function localise(o) {
        var r = Object.assign({}, o), hours = Number(o.hours) || 0, bonus = Number(o.bonus_hours) || 0;
        var save = o.mechanic === "range" ? rangeSave(o) : pct(o.price, o.was_price);
        var val = { hours: hours ? String(hours) : "", tier: plan(o.tier), save: save ? String(save) : "", bonus: bonus ? counted("offer.ui.hours", bonus) : "" };
        if (o.type && o.type !== "custom") {
            ["eyebrow", "headline", "subhead", "badge", "cta"].forEach(function (f) {
                // the type's English default, fitted to this offer exactly as the Worker's card fits it (item 21); a fitted text
                // uses its own translation (offer.fit.*), never the unfitted one ("Save ... this weekend" on a bonus offer)
                var en0 = ((window.OFFER_TYPES || {})[o.type] || {})[f] || "";
                var fitted = en0 ? fitWords(en0, o, save, f) : "";
                var changed = !!fitted && fitted !== en0;
                var s = changed ? FIT(fitted) : T("offer.t." + o.type + "." + f), ok = true;
                if (!s) { if (changed && !o[f]) r[f] = ""; return; }   // no translation yet: the card's own (fitted) English
                s = s.replace(/\{(hours|tier|save|bonus|pack)\}/g, function (_, k) { var x = val[k] || ""; if (!x) ok = false; return x; });
                if (ok && changed) s = s.charAt(0).toUpperCase() + s.slice(1);   // "every Standard pack ..." starts a sentence
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
        // 26 Nov 2026: a bonus offer keeps its free hours on the pack line ("10 Stunden +5 Stunden gratis · Standard")
        if (hours) r.pack = counted("offer.ui.hours", hours) + (o.mechanic === "bonus" && bonus ? " " + counted("offer.ui.bonusfree", bonus) : "") + (o.tier ? " · " + plan(o.tier) : "");
        if (Array.isArray(o.packs)) r.packs = o.packs.map(function (p) { return Object.assign({}, p, { label: counted("offer.ui.hours", Number(p.hours) || 0) }); });
        return r;
    }
    // ---- CCTV Converter cards (27 Nov 2026): plans, not hours ----
    // A COPY of CCTV_TEXT in the Worker's renderer (proxy/src/offerAssets.ts): the words that replace a type's DuoVox ones on a
    // CCTV Converter card. Keep them identical: _claude_tools/website_offers/cctv_sell/cctv_offer_i18n.py checks this copy against
    // the live renderer and puts the translatable lines on the page (offer.cctv.*).
    var CCTV_TEXT = {
        "flash":          { subhead: "{prod} for less, for a few hours only." },
        "black-friday":   { headline: "Black Friday deal", subhead: "Save {save}% on {prod} this weekend." },
        "cyber-monday":   { subhead: "One day only: {prod} for less." },
        "christmas":      { headline: "A Christmas *gift*", subhead: "{prod} for less this Christmas." },
        "new-year":       { headline: "New year, *new plan*", subhead: "Start the year with {prod} for less." },
        "lunar-new-year": { subhead: "Celebrate with {prod} for less." },
        "ramadan-eid":    { headline: "Eid offer", subhead: "{prod} for less this Eid." },
        "diwali":         { subhead: "Save {save}% on {prod}." },
        "summer":         { headline: "Summer sale", subhead: "Save {save}% on {prod}." },
        "spring":         { headline: "Spring sale", subhead: "Save {save}% on {prod} this spring." },
        "singles-day":    { subhead: "One day only: save {save}% on {prod}." },
        "best-value":     { eyebrow: "{prod}", headline: "Our *best value*", subhead: "{prod} for less." },
        "code":           { subhead: "Use it at checkout to save {save}% on {prod}." }
    };
    var PLAN_KEY = { Monthly: "monthly", Yearly: "yearly", Lifetime: "lifetime" };
    function planLabel(l) { return T("offer.cctv.plan." + (PLAN_KEY[l] || "-")) || l; }
    function localiseCctv(o) {
        var r = Object.assign({}, o), save = o.mechanic === "range" ? rangeSave(o) : pct(o.price, o.was_price);
        var val = { prod: o.plan_name || "CCTV Converter Pro", save: save ? String(save) : "" };
        if (o.type && o.type !== "custom") {
            ["eyebrow", "headline", "subhead", "badge", "cta"].forEach(function (f) {
                var cc = CCTV_TEXT[o.type] || {}, own = Object.prototype.hasOwnProperty.call(cc, f);
                var en0 = own ? cc[f] : (((window.OFFER_TYPES || {})[o.type] || {})[f] || "");
                if (!en0 || /\{(hours|tier|pack|bonus)\}/.test(en0)) return;   // a DuoVox-only line: the card's own words stay
                var fitted = fitWords(en0, o, save, f), changed = fitted !== en0;
                var s = changed ? FIT(fitted) : T((own ? "offer.cctv." : "offer.t.") + o.type + "." + f), ok = true;
                if (!s) return;   // no translation yet: the card's own (fitted) English
                s = s.replace(/\{(prod|save)\}/g, function (_, k) { var x = val[k] || ""; if (!x) ok = false; return x; });
                if (ok && changed) s = s.charAt(0).toUpperCase() + s.slice(1);
                if (ok) r[f] = s;
            });
        }
        if (!r.headline) r.headline = T("offer.ui.special") || "";
        if (!r.cta) r.cta = T("offer.ui.buy") || "";
        var m = /^(.*) · (.+)$/.exec(o.pack || "");
        if (m) r.pack = m[1] + " · " + planLabel(m[2]);
        if (Array.isArray(o.packs)) r.packs = o.packs.map(function (p) { return Object.assign({}, p, { label: planLabel(p.label) }); });
        return r;
    }
    // "Your first month, then £2.49 a month" (.oc-per) and "(first month)" beside a plan (.oc-range small)
    function cctvFirst(what, n) { return what === "months" ? counted("offer.cctv.first.months", n) : T("offer.cctv.first." + what); }
    function localiseCctvCard(card) {
        var per = card.querySelector(".oc-per");
        if (per && !per.hidden) {
            var m = /^Your first (month|year|(\d+) months), then (.+) a (month|year)$/.exec(per.textContent || "");
            if (m) {
                var n = Number(m[2]) || 0, base = n ? "offer.cctv.then.months" : "offer.cctv.then." + m[1];
                var s = n ? (T(base + "." + plural(n)) || T(base + ".other")) : T(base);
                if (s) per.textContent = fill(s, { n: n, p: m[3], d: "" });
            }
        }
        [].forEach.call(card.querySelectorAll(".oc-range small"), function (s) {
            var m = /^\(first (month|year|(\d+) months)\)$/.exec(s.textContent || "");
            var t = m && (m[2] ? cctvFirst("months", Number(m[2])) : cctvFirst(m[1]));
            if (t) s.textContent = "(" + t + ")";
        });
    }
    function localiseCard(card, o) {
        if (CCTV) localiseCctvCard(card);
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
        var page = CCTV ? "cctv" : /buy\.html$/.test(location.pathname) ? "buy" : "home";
        var ANCHOR = {
            home: { top: "#demo", "after-pricing": "#faq", bottom: ".disclaimer-section" },
            buy: { "after-pricing": "footer.footer", bottom: "footer.footer" },
            // davidarthur.app/cctvconverter/: under the opening section, after the prices, above the download box
            cctv: { top: "#features", "after-pricing": "#privacy-callout", bottom: "#download" }
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
        var shown = Object.assign({}, en ? o : CCTV ? localiseCctv(o) : localise(o), lay.landscape ? { set: "app", dismissible: false } : {});
        var card = window.renderOfferCard(shown);
        card.style.zoom = String(lay.zoom);
        // A CCTV Converter sale on every plan: each plan row is its own buy link and the card has no main button. The wide shape is
        // drawn as the app's card, which keeps the button (with no link): make the rows the links there too.
        if (CCTV && o.mechanic === "range" && !card.querySelector("a.oc-plan") && Array.isArray(o.packs)) {
            var lis = card.querySelectorAll(".oc-range li"), linked = 0;
            if (lis.length === o.packs.length) o.packs.forEach(function (p, i) {
                var sp = lis[i].querySelector("span");
                if (!sp || !/^https:\/\/api\.duovox\.net\/cctv\/buy\/[a-z0-9_]+\?/.test(p.cta_url || "")) return;
                var a = document.createElement("a");
                a.className = "oc-plan"; a.href = p.cta_url;
                while (sp.firstChild) a.appendChild(sp.firstChild);
                sp.appendChild(a); linked++;
            });
            if (linked === o.packs.length) { var c0 = card.querySelector(".oc-cta"); if (c0) c0.remove(); }
        }
        if (!en) localiseCard(card, o);
        // CCTV Converter: each plan row's link (a sale on every plan) - the offer's A/B side and the page language go along, as on
        // the main button
        [].forEach.call(card.querySelectorAll("a.oc-plan"), function (a) {
            if (preview) { a.removeAttribute("href"); a.addEventListener("click", function (e) { e.preventDefault(); }); return; }
            try {
                var u = new URL(a.getAttribute("href"), location.href);
                if (u.searchParams.get("offer")) { u.searchParams.set("v", variant); u.searchParams.set("lang", lang); a.href = u.toString(); }
            } catch (e) { /* keep the server's link */ }
            a.addEventListener("click", function () { send(o.id, variant, "click"); });
        });
        var cta = card.querySelector(".oc-cta");
        if (cta && preview) {
            cta.removeAttribute("href");
            cta.addEventListener("click", function (e) { e.preventDefault(); });
        } else if (cta) {
            try {
                var u = new URL(cta.getAttribute("href"), location.href);
                if (u.searchParams.get("offer")) {
                    u.searchParams.set("v", variant);
                    if (CCTV) u.searchParams.set("lang", lang);   // /cctv/buy/<plan>?offer=: an offer limited to some languages
                    // 26 Nov 2026 (David: "Get the deal" opened the buy page, which showed the same card with no way to pay): ON the
                    // buy page the button is the card / PayPal checkout itself - the offer's pack, or for a sale on every pack the
                    // hours list below. Website offers always sell by card (the server refuses a Store-only sale on the web).
                    // 26 Nov 2026 (David): on EVERY page the button goes straight to Paddle for a one-pack offer; only a sale on
                    // every pack still opens the hours list (on the buy page itself: jump to it).
                    if (/\/buy\.html$/.test(u.pathname)) {
                        var tok = o.token || PACK_TOKEN[o.pack_id] || "";
                        if (/^duovox_[a-z0-9_]+$/.test(tok)) {
                            u = new URL(API + "/buy/" + tok);
                            u.searchParams.set("offer", o.id); u.searchParams.set("v", variant); u.searchParams.set("lang", lang);
                        } else if (/\/buy(\.html)?$/.test(location.pathname)) u = new URL("#hours", location.href);
                        else u.hash = "hours";
                    }
                    cta.href = u.toString();
                }
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
    var lastPreview = null, lastLive = null, resizeT = 0, lastSpot = null;
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
                // the draft's spot - 26 Nov 2026 (David: moving something in the APP tile scrolled the builder back up to the website
                // tile): scrollIntoView also scrolls the ADMIN page around this frame. Scroll inside this frame only, and only when
                // the draft lands in a new spot (first preview, or its place changed), never on every edit.
                var spot = spotKey(d.offer.web_place) || "pricing";
                if (h && spot !== lastSpot) {
                    lastSpot = spot;
                    var r = h.getBoundingClientRect();
                    window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - (window.innerHeight - r.height) / 2));
                }
            });
        });
        try { window.parent.postMessage({ type: "duovox-offer-preview-ready" }, API); } catch (e) { /* not framed by the admin */ }
        return;
    }

    var liveN = 0;
    function loadLive() {
        var n = ++liveN;
        fetch(API + "/offers?set=web" + (CCTV ? "&product=cctv" : "") + "&lang=" + encodeURIComponent(lang), { mode: "cors", credentials: "omit" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (n !== liveN) return;   // the language changed again meanwhile
                var list = (d && Array.isArray(d.offers) ? d.offers : []).filter(function (x) { return x && ID_RE.test(x.id || ""); });
                var groups = groupOffers(list);
                if (!groups.length) { if (lastLive) { lastLive = null; show([], false, true); } return; }
                return loadCards(d.cards).then(function () { if (n === liveN) { lastLive = groups; show(groups, false); } });
            })
            .catch(function () { /* no offer shown: the page is as it always was */ });
    }
    loadLive();
    // 26 Nov 2026: davidarthur.app/duovox/ loads this file too. Its language is chosen in the page (i18n.js), which fires
    // "i18n-applied" once the words (the offer-i18n template included) are in: ask again in that language and redraw.
    document.addEventListener("i18n-applied", function () {
        var l = (document.documentElement.lang || "en").toLowerCase();
        if (l === lang) return;
        lang = l; plural = mkPlural(); fitMap = null;
        loadLive();
    });
})();
