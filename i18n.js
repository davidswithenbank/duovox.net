(function () {
  'use strict';

  var LANGS = [
    ['en', 'English'],
    ['es', 'Español'],
    ['fr', 'Français'],
    ['de', 'Deutsch'],
    ['pt', 'Português'],
    ['it', 'Italiano'],
    ['nl', 'Nederlands'],
    ['pl', 'Polski'],
    ['ru', 'Русский'],
    ['uk', 'Українська'],
    ['tr', 'Türkçe'],
    ['ar', 'العربية'],
    ['hi', 'हिन्दी'],
    ['zh-CN', '中文(简体)'],
    ['zh-TW', '中文(繁體)'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['vi', 'Tiếng Việt'],
    ['th', 'ไทย'],
    ['id', 'Bahasa Indonesia']
  ];

  var RTL = { ar: true };
  var KEY = 'duovox-lang';
  var cache = {};

  // Currency: each price element carries data-price-{usd,gbp,eur} attributes (and the
  // period text carries data-period-{usd,gbp,eur} attributes). The JS picks the right one
  // based on visitor locale. Default is USD (the rest-of-world default).
  //
  // This is a region-based VALUE swap, not a symbol swap, because Microsoft Store and
  // Google Play map a USD base price to specific GBP/EUR tier values that AREN'T 1:1
  // conversions (e.g. $19.99 USD ↔ £15.99 GBP ↔ €19.99 EUR via the standard MS Store
  // consumer tier). The website must show the same per-region values the store will
  // charge, so we can't just swap symbols.
  //
  // Locale → currency mapping:
  //   en-gb            → GBP
  //   fr/de/it/nl/es/pt → EUR
  //   everything else  → USD
  var EUR_LANGS = { fr: 1, de: 1, it: 1, nl: 1, es: 1, pt: 1 };
  var EUR_ENABLED = false;

  function getCurrCode(lang) {
    if (lang === 'en') {
      var nl = (navigator.language || '').toLowerCase();
      if (nl === 'en-gb' || nl.indexOf('en-gb') === 0) return 'gbp';
      return 'usd';
    }
    // 29 Sep 2026: DuoVox is not yet available in the EU/EEA (no Art.27 representative yet), so euro prices
    // are not shown. The data-*-eur attributes stay in the markup; set EUR_ENABLED = true at the EU launch.
    return (EUR_ENABLED && EUR_LANGS[lang]) ? 'eur' : 'usd';
  }

  // Apply the chosen currency to all marked price elements.
  // `code` is 'usd' / 'gbp' / 'eur' (lower-case for attribute lookup).
  // All assignments use textContent — no innerHTML, no XSS surface. The HTML is
  // structured so each region-varying string lives in its own element with
  // data-{price,annual,payg}-{usd,gbp,eur} attributes; static text like "per month"
  // stays in the markup as-is.
  function applyCurr(code) {
    // Headline price amounts.
    var amounts = document.querySelectorAll('.price-amount, .price-highlight-amount');
    for (var i = 0; i < amounts.length; i++) {
      var el = amounts[i];
      var val = el.getAttribute('data-price-' + code);
      if (val) el.textContent = val;
    }
    // Annual-savings spans inside .price-period.
    var annuals = document.querySelectorAll('.price-annual');
    for (var j = 0; j < annuals.length; j++) {
      var ael = annuals[j];
      var aval = ael.getAttribute('data-annual-' + code);
      if (aval) ael.textContent = aval;
    }
    // PAYG per-tier rate lines.
    var payg = document.querySelectorAll('.payg-rate');
    for (var k = 0; k < payg.length; k++) {
      var pgel = payg[k];
      var pgval = pgel.getAttribute('data-payg-' + code);
      if (pgval) pgel.textContent = pgval;
    }
    // Note: we don't substitute the currency-code in the pricing subtitle anymore.
    // The default subtitle text explains the per-region behaviour ("Default prices in
    // USD. UK visitors see GBP. DuoVox is not yet available in the EU or EEA.") which is already
    // region-aware in prose — no token replacement needed.
  }

  function buildSelector() {
    var nav = document.querySelector('.nav-inner');
    if (!nav) return null;

    var wrap = document.createElement('div');
    wrap.className = 'lang-wrap';
    wrap.innerHTML = '<span class="lang-icon">&#127760;</span>';

    var sel = document.createElement('select');
    sel.className = 'lang-select';
    sel.setAttribute('aria-label', 'Language');

    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l[0];
      o.textContent = l[1];
      sel.appendChild(o);
    });

    wrap.appendChild(sel);
    nav.appendChild(wrap);
    return sel;
  }

  function apply(t) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (!el.hasAttribute('data-t')) el.setAttribute('data-t', el.textContent);
      if (t[k] != null) el.textContent = t[k];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (!el.hasAttribute('data-t')) el.setAttribute('data-t', el.innerHTML);
      if (t[k] != null) el.innerHTML = t[k];
    });
  }

  function restore() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var d = el.getAttribute('data-t');
      if (d != null) el.textContent = d;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var d = el.getAttribute('data-t');
      if (d != null) el.innerHTML = d;
    });
  }

  // localStorage can be unavailable (private windows, blocked site data); the page must work without it.
  function savedLang() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function saveLang(code) { try { localStorage.setItem(KEY, code); } catch (e) { /* not remembered */ } }

  // Pages that have a built copy per language (tools/build_lang_pages.py) carry
  // <link rel="alternate" hreflang="xx">. Switching language on those pages goes to that copy, so the
  // address, the page title and what search engines index all match the language shown. Pages without
  // copies (privacy, terms) keep swapping the text in place as before.
  function altPath(code) {
    var l = document.querySelector('link[rel="alternate"][hreflang="' + code + '"]');
    if (!l) return null;
    try { return new URL(l.getAttribute('href'), location.href).pathname; } catch (e) { return null; }
  }
  function goTo(code) {
    var p = altPath(code);
    if (!p) return false;
    saveLang(code);
    location.href = p + location.hash;
    return true;
  }

  function setLang(code) {
    saveLang(code);
    document.documentElement.lang = code;
    document.documentElement.dir = RTL[code] ? 'rtl' : 'ltr';

    if (code === 'en') { restore(); applyCurr(getCurrCode(code)); return; }
    if (cache[code]) { apply(cache[code]); applyCurr(getCurrCode(code)); return; }

    fetch('/lang/' + code + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cache[code] = j; apply(j); applyCurr(getCurrCode(code)); })
      .catch(function (e) { console.warn('i18n: ' + code, e); });
  }

  // The visitor's preferred site language from the browser, or null. Only the FIRST browser language
  // that the site has counts, and an English preference ahead of it wins: someone who lists English
  // first chose English. zh-TW/HK/MO/Hant map to Traditional, any other zh to Simplified.
  function browserLang() {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i] || '').toLowerCase();
      if (!t) continue;
      if (t.indexOf('en') === 0) return null;
      if (t.indexOf('zh') === 0) return /^zh-(tw|hk|mo|hant)/.test(t) ? 'zh-TW' : 'zh-CN';
      var p = t.split('-')[0];
      for (var j = 0; j < LANGS.length; j++) if (LANGS[j][0] === p) return p;
    }
    return null;
  }

  // ⛔ A SUGGESTION, NEVER A REDIRECT. Search engines crawl in English and are told by hreflang where each
  // language copy lives; redirecting on the browser language can hide the English page from them and traps
  // people who want English. So: a small bar, in the visitor's own language, offering the copy of THIS page.
  // "No thanks" saves English as their choice, so it is asked once. Only on the English pages, only when
  // no language has been chosen yet, and only where this page has a copy in that language.
  function suggestLang() {
    var code = browserLang();
    if (!code || !altPath(code)) return;
    fetch('/lang/' + code + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (t) {
        if (!t['suggest.text'] || !t['suggest.no']) return;
        var name = '';
        for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) name = LANGS[i][1];
        var bar = document.createElement('div');
        bar.className = 'lang-suggest';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Language');
        bar.lang = code;
        if (RTL[code]) bar.dir = 'rtl';
        var msg = document.createElement('span');
        msg.textContent = t['suggest.text'];
        var yes = document.createElement('button');
        yes.type = 'button';
        yes.className = 'lang-suggest-yes';
        yes.textContent = name;
        yes.addEventListener('click', function () { goTo(code); });
        var no = document.createElement('button');
        no.type = 'button';
        no.className = 'lang-suggest-no';
        no.textContent = t['suggest.no'];
        no.addEventListener('click', function () { saveLang('en'); bar.parentNode.removeChild(bar); });
        bar.appendChild(msg);
        bar.appendChild(yes);
        bar.appendChild(no);
        document.body.appendChild(bar);
      })
      .catch(function () { /* no suggestion; the page is unaffected */ });
  }

  function init() {
    var sel = buildSelector();
    if (!sel) return;

    // A built language copy: its text and prices are already in place.
    var staticLang = document.documentElement.getAttribute('data-static-lang');
    if (staticLang) {
      sel.value = staticLang;
      sel.addEventListener('change', function () { if (!goTo(this.value)) setLang(this.value); });
      return;
    }

    var saved = savedLang();
    var lang = (saved && LANGS.some(function (l) { return l[0] === saved; })) ? saved : 'en';
    if (!saved) suggestLang();
    sel.value = lang;
    sel.addEventListener('change', function () {
      if (this.value === 'en' || !goTo(this.value)) setLang(this.value);
    });
    if (lang !== 'en') {
      var p = altPath(lang);
      if (p) { location.replace(p + location.hash); return; }
      setLang(lang);
    }
    else applyCurr(getCurrCode('en'));
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
