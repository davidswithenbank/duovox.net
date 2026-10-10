# -*- coding: utf-8 -*-
"""Shared helpers for the per-language pages (build_lang_pages.py) and their checks (check_translations.py).

The ENGLISH SOURCE of every string is the English HTML page itself (what an English visitor sees), never
lang/en.json, which has gone stale before. Translations live in lang/<code>.json. lang/_translated_from.json
records, per language and key, a hash of the English a translation was made FROM, so a later English edit
marks that translation stale instead of silently keeping the old wording.
"""
import hashlib
import html
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG_DIR = os.path.join(ROOT, "lang")
PROVENANCE = os.path.join(LANG_DIR, "_translated_from.json")

# The pages that get a copy per language. Privacy and Terms stay English-only (generated documents, see
# DuoVox Desktop App/_claude_tools/terms_sync.py); checkout pages are not for search.
PAGES = ["index.html", "calls.html", "languages.html", "security.html", "contact.html", "help.html"]
SITE = "https://duovox.net"

# Translatable wording around prices. The NUMBERS are never translated: they are read at build time from the
# English page's data-price-* attributes, which the admin price publisher keeps current.
PRICE_TEMPLATES = {
    "price.from": "from {p}",
    "price.per_month": "per month",
    "price.annual_year": "or {p}/yr — 1 month free",
    "price.annual_6mo": "or {p}/6mo",
    "price.payg_standard": "Standard quality: {p}/hour",
    "price.payg_professional": "Professional quality: {p}/hour",
    # languages.html: built from these too, so the counts and the generation date never need translating
    "lang.count": "{n} languages",
    "lang.updated": "Last updated {d}",
}


def read(path):
    return io.open(path, encoding="utf-8", newline="").read()


def langs_from_i18n_js():
    """[(code, native name)], the RTL set and the EUR switch, read from i18n.js so there is one list."""
    s = read(os.path.join(ROOT, "i18n.js"))
    block = re.search(r"var LANGS = \[(.*?)\];", s, re.S).group(1)
    langs = re.findall(r"\['([^']+)',\s*'([^']+)'\]", block)
    rtl = set(re.findall(r"(\w+):\s*true", re.search(r"var RTL = \{([^}]*)\}", s).group(1)))
    eur_on = re.search(r"var EUR_ENABLED = (true|false);", s).group(1) == "true"
    eur_langs = set(re.findall(r"(\w+):\s*1", re.search(r"var EUR_LANGS = \{([^}]*)\}", s).group(1)))
    return langs, rtl, eur_on, eur_langs


def norm(text):
    """The comparable form of a string: entities decoded, whitespace collapsed."""
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def h(text):
    return hashlib.sha1(norm(text).encode("utf-8")).hexdigest()[:16]


OPEN_RX = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\sdata-i18n(-html)?="([^"]+)"([^>]*)>')


def find_close(s, tag, start):
    """Index of the </tag> matching an element whose content starts at `start` (nesting-aware)."""
    depth, i = 1, start
    rx = re.compile(r"<(/?)%s\b[^>]*>" % re.escape(tag), re.I)
    while True:
        m = rx.search(s, i)
        if not m:
            raise ValueError("unclosed <%s> at %d" % (tag, start))
        if m.group(0).endswith("/>"):
            i = m.end(); continue
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.start(), m.end()
        i = m.end()


def elements(s):
    """Yield (key, is_html, content_start, content_end) for every data-i18n element, in document order."""
    for m in OPEN_RX.finditer(s):
        tag = m.group(1)
        cs = m.end()
        ce, _ = find_close(s, tag, cs)
        yield m.group(4), bool(m.group(3)), cs, ce


def meta_values(s):
    title = re.search(r"<title>(.*?)</title>", s, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', s)
    return (title.group(1) if title else None), (desc.group(1) if desc else None)


def english_source():
    """{key: (english_text, is_html)} gathered from the English pages, plus page meta and price templates."""
    src = {}
    for page in PAGES:
        s = read(os.path.join(ROOT, page))
        for key, is_html, cs, ce in elements(s):
            text = s[cs:ce].strip()
            if key in src and norm(src[key][0]) != norm(text):
                raise ValueError("key %s has two different English texts (%s)" % (key, page))
            src[key] = (text, is_html)
        title, desc = meta_values(s)
        stem = page[:-5]
        if title:
            src["meta.%s.title" % stem] = (title, False)
        if desc:
            src["meta.%s.desc" % stem] = (desc, False)
    for k, v in PRICE_TEMPLATES.items():
        src[k] = (v, False)
    return src


def load_lang(code):
    p = os.path.join(LANG_DIR, code + ".json")
    return json.loads(read(p)) if os.path.exists(p) else {}


def load_language_names():
    """{code: {English language name: name in that language}} for the languages.html table (app's own table)."""
    p = os.path.join(LANG_DIR, "_language_names.json")
    return json.loads(read(p)) if os.path.exists(p) else {}


# Visible text that is deliberately NOT translated: product and competitor names, contact addresses, marks.
UNTRANSLATED_OK = re.compile(
    r"^(DuoVox|Windows|Google Translate|iTranslate|Microsoft Translator|DeepL|David Arthur Software|"
    r"[\w.+-]+@[\w.-]+|[–—✓•\-]|\d+)$")


# Elements whose wording the build fills from PRICE_TEMPLATES / the names file, not from data-i18n.
BUILD_FILLED = {"lc-n", "lc-count", "lc-foot", "price-period", "price-annual", "payg-rate", "price-amount",
                "price-highlight-amount"}


def unkeyed_text(s):
    """Visible text pieces outside any data-i18n element (they would stay English on every language page).
    Language names in the languages.html table are exempt: the build translates them from _language_names.json,
    and the native-name column is meant to stay in each language's own script."""
    from html.parser import HTMLParser

    class P(HTMLParser):
        VOID = {"br", "img", "meta", "link", "input", "hr", "source", "wbr"}
        SKIP = {"script", "style", "select", "option", "title", "head", "svg"}

        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack, self.out = [], []

        def handle_starttag(self, tag, attrs):
            if tag in self.VOID:
                return
            a = dict(attrs)
            exempt = ("data-i18n" in a or "data-i18n-html" in a
                      or a.get("class", "").split(" ")[0] in BUILD_FILLED)
            self.stack.append((tag, exempt))

        def handle_endtag(self, tag):
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    break

        def handle_data(self, d):
            t = re.sub(r"\s+", " ", d).strip()
            if not t or not re.search(r"[^\W\d_]", t) or UNTRANSLATED_OK.match(t):
                return
            if any(ex for _, ex in self.stack) or any(tag in self.SKIP for tag, _ in self.stack):
                return
            self.out.append(t)

    p = P()
    p.feed(s)
    return p.out


def load_provenance():
    return json.loads(read(PROVENANCE)) if os.path.exists(PROVENANCE) else {}


def save_provenance(data):
    tmp = PROVENANCE + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
    os.replace(tmp, PROVENANCE)


def status(code, src, lang, prov):
    """{key: 'ok' | 'missing' | 'stale'} for one language."""
    out = {}
    rec = prov.get(code, {})
    for key, (text, _) in src.items():
        if key not in lang:
            out[key] = "missing"
        elif rec.get(key) != h(text):
            out[key] = "stale"
        else:
            out[key] = "ok"
    return out
