/* Quick buy (27 Nov 2026, David): a plan card's button opens <dialog id="qb"> with that plan's choices - each "Buy now" goes
   straight to the card / PayPal checkout - and "How it works" opens the steps in the same pop-up instead of leaving the page.
   Without JavaScript (or <dialog>) every link keeps its own href (buy.html / help.html), so nothing is lost. */
(function () {
    "use strict";
    var dlg = document.getElementById("qb");
    if (!dlg || typeof dlg.showModal !== "function") return;
    var groups = dlg.querySelectorAll("[data-qb-group]"), after = dlg.querySelector("[data-qb-after]"), back = null;
    function show(id) {
        var found = false;
        for (var i = 0; i < groups.length; i++) { var on = groups[i].getAttribute("data-qb-group") === id; groups[i].hidden = !on; found = found || on; }
        if (!found) return false;
        if (after) after.hidden = id === "howto" || id === "pay";
        dlg.classList.toggle("qb-two", id === "hours");   // Standard and Professional packs side by side
        dlg.classList.toggle("qb-wide", id === "pay");   // the checkout: wide, our details beside Paddle's form (no scrolling)
        if (!dlg.open) dlg.showModal();
        dlg.scrollTop = 0;
        return true;
    }
    document.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("[data-quickbuy],[data-howto]") : null;
        if (!a) return;
        var id = a.hasAttribute("data-howto") ? "howto" : a.getAttribute("data-quickbuy");
        if (a.hasAttribute("data-howto") && dlg.open) { back = currentGroup(); }
        else if (!dlg.open) back = null;
        if (show(id)) e.preventDefault();
    });
    function currentGroup() { for (var i = 0; i < groups.length; i++) if (!groups[i].hidden) return groups[i].getAttribute("data-qb-group"); return null; }
    dlg.addEventListener("click", function (e) {
        if (e.target === dlg) dlg.close();                            // a click on the backdrop
        if (e.target.closest && e.target.closest("[data-qb-close]")) dlg.close();
        if (e.target.closest && e.target.closest("[data-qb-back]")) {
            e.preventDefault();
            var was = currentGroup();
            if (back && back !== was) { show(back); back = null; } else dlg.close();
            if (was === "pay") endPay();
        }
    });
    dlg.addEventListener("close", function () { endPay(); });

    // ---- Checkout in the pop-up (27 Nov 2026, David: stay on the page, make the payment step look like DuoVox) ----
    // A "Buy now" link (api.duovox.net/buy/<token>) starts the checkout as JSON (the Worker allows this for duovox.net only)
    // and Paddle's payment form opens INLINE under our own header and order line. Anything that fails - another site, an old
    // browser, Paddle not loading - follows the link as before (the Worker's own checkout page).
    var API = "https://api.duovox.net", payBox = dlg.querySelector('[data-qb-group="pay"]');
    var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]qbdemo=1/.test(location.search);
    var libs = null, paying = false;
    function loadScript(src) {
        return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
    }
    function ensureLibs() {
        if (!libs) libs = (window.Paddle ? Promise.resolve() : loadScript("https://cdn.paddle.com/paddle/v2/paddle.js"))
            .then(function () { return window.DuoVoxCheckout ? null : loadScript(API + "/pay/checkout.js?app=duovox"); });
        return libs;
    }
    function text(el) { return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
    function setPay(k, v) { var el = payBox.querySelector("[data-qb-" + k + "]"); if (el) { el.textContent = v || ""; el.hidden = !v; } }
    function endPay() {
        if (!paying) return;
        paying = false;
        try { if (window.Paddle && Paddle.Checkout && Paddle.Checkout.close) Paddle.Checkout.close(); } catch (e) { /* nothing open */ }
        var f = payBox && payBox.querySelector(".dvx-pay"); if (f) f.replaceChildren();
    }
    function startPay(a) {
        var opt = a.closest(".opt"), tier = a.closest(".tier"), card = a.closest(".oc");
        var name = card ? text(card.querySelector(".oc-headline")) : [text(tier && tier.querySelector("h3")), text(opt && opt.querySelector(".opt-name > span:first-child, .opt-name"))].filter(Boolean).join(" · ");
        var price = card ? text(card.querySelector(".oc-now")) : text(opt && opt.querySelector(".price-amount"));
        var sub = card ? text(card.querySelector(".oc-pack")) : text(opt && opt.querySelector(".opt-sub"));
        setPay("item", name || "DuoVox"); setPay("price", price); setPay("sub", sub);
        var st = payBox.querySelector("[data-qb-status]"), fr = payBox.querySelector(".dvx-pay");
        if (st) st.hidden = false;
        fr.replaceChildren();
        back = dlg.open ? currentGroup() : null;
        if (back === "pay") back = null;
        paying = true;
        show("pay");
        if (DEMO) { if (st) st.hidden = true; fr.innerHTML = '<div class="dvx-demo">Paddle&rsquo;s card / PayPal form appears here<br><small>(email, country, card or PayPal &mdash; one page)</small></div>'; return; }
        var gone = false;
        function fallback() { if (gone || !paying) return; gone = true; location.href = a.href; }
        var u;
        try { u = new URL(a.href); u.searchParams.set("json", "1"); } catch (e) { return fallback(); }
        Promise.all([
            fetch(u.toString(), { mode: "cors", credentials: "omit", cache: "no-store" }).then(function (r) { return r.json(); }),
            ensureLibs()
        ]).then(function (v) {
            var j = v[0];
            if (!paying) return;
            if (j && !j.txn && typeof j.error === "string") { if (st) { st.textContent = j.error; st.hidden = false; } return; }   // a refusal (e.g. country): say why
            if (!j || !j.txn || !window.DuoVoxCheckout || !window.DuoVoxCheckout.open(j.txn, j.c, "dvx-pay")) return fallback();
            setTimeout(function () { if (st && fr.childNodes.length) st.hidden = true; }, 2500);
        }).catch(fallback);
    }
    // SWITCH: false = only a page opened with ?qbpay=1 uses the in-page checkout (to prove it on the live site first);
    // true = every buyer. Everyone else follows the link to the Worker's checkout page, as before.
    var PAY_FOR_ALL = true;
    var TRY = /[?&]qbpay=1/.test(location.search);
    // davidarthur.app/duovox/ loads this same file (27 Nov 2026); the Worker must allow its origin on /buy/<token>?json=1 -
    // until it does, the request fails there and the link is followed as before.
    var HOME = location.origin === "https://duovox.net" || location.origin === "https://davidarthur.app";
    if (payBox && window.fetch && window.Promise && ((HOME && (PAY_FOR_ALL || TRY)) || DEMO)) {
        document.addEventListener("click", function (e) {
            var a = e.target.closest ? e.target.closest('a[href^="' + API + '/buy/"]') : null;
            if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            startPay(a);
        });
        window.addEventListener("duovox-checkout", function (e) {
            var d = e.detail || {}, st = payBox.querySelector("[data-qb-status]");
            if (d.name === "checkout.loaded" && st) st.hidden = true;
            // the real total (with tax, in the buyer's currency) once Paddle knows it
            try { var t = d.data && d.data.totals, c = d.data && d.data.currency_code;
                if (t && typeof t.total === "number" && c) setPay("price", new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: c }).format(t.total));
            } catch (x) { /* keep the page's price */ }
        });
    }

    // per-hour prices and "Save x%" inside the pop-up follow the prices on the page (currency swap + admin price list)
    function num(el) { var m = (el.textContent || "").match(/([^\d\s]*)\s*([\d.,]+)/); if (!m) return null;
        return { sym: m[1], v: parseFloat(m[2].replace(/,/g, "")) }; }
    var tpl = {};
    function update() {
        var els = dlg.querySelectorAll(".price-amount[data-hours]");
        for (var i = 0; i < els.length; i++) {
            var h = parseFloat(els[i].getAttribute("data-hours")), p = num(els[i]);
            var ph = els[i].parentNode.querySelector(".ph");
            if (!ph || !p || !(h > 1)) continue;
            var t = p.sym + (p.v / h).toFixed(2);
            if (ph.textContent !== t) ph.textContent = t;
        }
        var saves = dlg.querySelectorAll(".save[data-save-of]");
        for (var j = 0; j < saves.length; j++) {
            var s = saves[j];
            if (s.textContent.indexOf("{p}") >= 0) tpl[j] = s.textContent;
            var a = document.getElementById(s.getAttribute("data-save-of")), b = document.getElementById(s.getAttribute("data-save-for"));
            var n = parseFloat(s.getAttribute("data-months")), pa = a && num(a), pb = b && num(b);
            if (!pa || !pb || !tpl[j]) continue;
            var pct = Math.floor((1 - pb.v / (pa.v * n)) * 100);
            var out = pct > 0 ? tpl[j].replace("{p}", pct) : "";
            if (s.textContent !== out) s.textContent = out;
        }
    }
    update();
    if (window.MutationObserver) new MutationObserver(update).observe(dlg, { subtree: true, childList: true, characterData: true });
})();

// The comparison table: rows 7+ wait behind "Show the full comparison" (no JavaScript = the button does nothing, so
// the rows are only hidden once this file has run).
(function () {
    var b = document.querySelector('[data-cmp-showall]'), t = document.querySelector('.comparison-table');
    if (!b || !t) return;
    t.classList.add('cmp-short'); b.parentNode.hidden = false;
    b.addEventListener('click', function () { t.classList.remove('cmp-short'); b.parentNode.hidden = true; });
})();
