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

  function getCurrCode(lang) {
    if (lang === 'en') {
      var nl = (navigator.language || '').toLowerCase();
      if (nl === 'en-gb' || nl.indexOf('en-gb') === 0) return 'gbp';
      return 'usd';
    }
    return EUR_LANGS[lang] ? 'eur' : 'usd';
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
    // USD. UK visitors see GBP and Eurozone visitors see EUR.") which is already
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

  function setLang(code) {
    localStorage.setItem(KEY, code);
    document.documentElement.lang = code;
    document.documentElement.dir = RTL[code] ? 'rtl' : 'ltr';

    if (code === 'en') { restore(); applyCurr(getCurrCode(code)); return; }
    if (cache[code]) { apply(cache[code]); applyCurr(getCurrCode(code)); return; }

    fetch('lang/' + code + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cache[code] = j; apply(j); applyCurr(getCurrCode(code)); })
      .catch(function (e) { console.warn('i18n: ' + code, e); });
  }

  function init() {
    var sel = buildSelector();
    if (!sel) return;

    var saved = localStorage.getItem(KEY);
    var lang = (saved && LANGS.some(function (l) { return l[0] === saved; })) ? saved : 'en';
    sel.value = lang;
    sel.addEventListener('change', function () { setLang(this.value); });
    if (lang !== 'en') setLang(lang);
    else applyCurr(getCurrCode('en'));
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
