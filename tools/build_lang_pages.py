# -*- coding: utf-8 -*-
r"""Build the deployable site: the repo's pages as they are, plus a copy of each page in PAGES per language.

    python tools/build_lang_pages.py --out _site

Run by .github/workflows/pages.yml on every push (so a price publish or a text edit rebuilds every language
copy), and locally to preview. The repo itself is never modified: the copies exist only in the output folder.

Per language copy:
  - every data-i18n / data-i18n-html element gets its translation; a MISSING or STALE translation keeps the
    English (never old wording) and is listed in the build report;
  - prices: the numbers come from the English page's data-price-*/data-annual-*/data-payg-* attributes (kept
    current by the admin price publisher); only the words around them are translated (PRICE_TEMPLATES);
  - <title>, description and social-card text translated; canonical = the page's own language URL;
  - hreflang alternates for every language plus x-default, on the English pages too;
  - relative links: same-folder for the localised pages, '../' for everything else.
"""
import argparse
import html
import io
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitei18n as S  # noqa: E402

EXCLUDE_DIRS = {".git", ".github", "tools", "_site", "node_modules"}
EXCLUDE_FILES = {"server.js", "lang/_translated_from.json"}
EXCLUDE_EXT = {".py", ".md"}


def url_for(code, page):
    base = S.SITE + ("/" if code == "en" else "/%s/" % code)
    return base if page == "index.html" else base + page


def alternates(langs, page):
    lines = ['<link rel="alternate" hreflang="%s" href="%s">' % (c, url_for(c, page)) for c, _ in langs]
    lines.append('<link rel="alternate" hreflang="x-default" href="%s">' % url_for("en", page))
    return lines


def inject_head(s, extra_lines):
    m = re.search(r"([ \t]*)<link rel=\"canonical\"[^>]*>\r?\n", s)
    indent = m.group(1) if m else "    "
    block = "".join(indent + l + "\n" for l in extra_lines)
    if m:
        return s[:m.end()] + block + s[m.end():]
    return s.replace("</head>", block + "</head>", 1)


def set_canonical(s, url):
    if 'rel="canonical"' in s:
        return re.sub(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="%s">' % url, s, count=1)
    return s.replace("</title>", '</title>\n    <link rel="canonical" href="%s">' % url, 1)


def rewrite_links(s):
    pages = set(S.PAGES)

    def fix(m):
        attr, val = m.group(1), m.group(2)
        if re.match(r"(https?:|mailto:|tel:|//|#|/|data:|javascript:)", val):
            return m.group(0)
        path = re.split(r"[?#]", val, maxsplit=1)[0]
        if path in pages:
            return m.group(0)                      # stays in this language's folder
        return '%s="../%s"' % (attr, val)
    return re.sub(r'\b(href|src|poster)="([^"]*)"', fix, s)


def price_text(attr_val):
    return html.unescape(attr_val)


def localise_prices(s, lang, cur):
    t = lambda k: lang.get(k) if k in lang else None  # noqa: E731
    out = []
    pos = 0
    rx = re.compile(r'<div class="(?:price-amount|price-highlight-amount)" data-price-usd="([^"]*)" data-price-gbp="([^"]*)" data-price-eur="([^"]*)">[^<]*</div>')
    for m in rx.finditer(s):
        attrs = {"usd": m.group(1), "gbp": m.group(2), "eur": m.group(3)}
        val = html.unescape(attrs[cur])
        num = re.search(r"[$£€][\d.,]+", val).group(0)
        text = (t("price.from") or S.PRICE_TEMPLATES["price.from"]).replace("{p}", num) if val.lower().startswith("from") else num
        full = m.group(0)
        out.append(s[pos:m.start()] + full[:full.index(">") + 1] + html.escape(text, quote=False) + "</div>")
        pos = m.end()
    s = "".join(out) + s[pos:]

    per_month = t("price.per_month") or S.PRICE_TEMPLATES["price.per_month"]
    s = re.sub(r'(<div class="price-period">)per month(\s*<span class="price-annual")',
               lambda m: m.group(1) + html.escape(per_month, quote=False) + m.group(2), s)

    def annual(m):
        val = html.unescape(re.search(r'data-annual-%s="([^"]*)"' % cur, m.group(1)).group(1))
        num = re.search(r"[$£€][\d.,]+", val).group(0)
        key = "price.annual_6mo" if "/6mo" in val else "price.annual_year"
        return m.group(1) + html.escape((t(key) or S.PRICE_TEMPLATES[key]).replace("{p}", num), quote=False) + "</span>"
    s = re.sub(r'(<span class="price-annual"[^>]*>)[^<]*</span>', annual, s)

    def payg(m):
        val = html.unescape(re.search(r'data-payg-%s="([^"]*)"' % cur, m.group(1)).group(1))
        num = re.search(r"[$£€][\d.,]+", val).group(0)
        key = "price.payg_professional" if val.lower().startswith("professional") else "price.payg_standard"
        return m.group(1) + html.escape((t(key) or S.PRICE_TEMPLATES[key]).replace("{p}", num), quote=False) + "</li>"
    s = re.sub(r'(<li class="payg-rate"[^>]*>)[^<]*</li>', payg, s)
    return s


def localise(s, page, code, lang, ok, rtl, langs, cur):
    report = []
    # 1. text elements, last first so earlier offsets stay valid
    els = list(S.elements(s))
    for key, is_html, cs, ce in reversed(els):
        if ok.get(key) == "ok":
            val = lang[key] if is_html else html.escape(lang[key], quote=False)
            s = s[:cs] + val + s[ce:]
        else:
            report.append((key, ok.get(key, "missing")))
    # 2. head: title, description, social cards, canonical, alternates
    stem = page[:-5]
    title_k, desc_k = "meta.%s.title" % stem, "meta.%s.desc" % stem
    if ok.get(title_k) == "ok":
        tt = html.escape(lang[title_k], quote=False)
        s = re.sub(r"<title>.*?</title>", lambda m: "<title>%s</title>" % tt, s, count=1, flags=re.S)
        for prop in ('property="og:title"', 'name="twitter:title"'):
            s = re.sub(r'(<meta %s content=")[^"]*(")' % prop, lambda m: m.group(1) + html.escape(lang[title_k]) + m.group(2), s)
    elif title_k in ok:
        report.append((title_k, ok[title_k]))
    if ok.get(desc_k) == "ok":
        dd = html.escape(lang[desc_k])
        for prop in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
            s = re.sub(r'(<meta %s content=")[^"]*(")' % prop, lambda m: m.group(1) + dd + m.group(2), s)
    elif desc_k in ok:
        report.append((desc_k, ok[desc_k]))
    s = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url_for(code, page) + m.group(2), s)
    s = set_canonical(s, url_for(code, page))
    s = inject_head(s, alternates(langs, page))
    s = re.sub(r'<html lang="[^"]*"', '<html lang="%s"%s data-static-lang="%s"' % (code, ' dir="rtl"' if code in rtl else "", code), s, count=1)
    # 3. prices, 4. links
    s = localise_prices(s, {k: v for k, v in lang.items() if ok.get(k) == "ok"}, cur)
    s = rewrite_links(s)
    return s, report


def copy_site(out):
    if os.path.exists(out):
        shutil.rmtree(out)
    for dirpath, dirnames, filenames in os.walk(S.ROOT):
        rel_dir = os.path.relpath(dirpath, S.ROOT)
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not (rel_dir == "." and d.startswith("_"))]
        for f in filenames:
            rel = os.path.normpath(os.path.join(rel_dir, f)).replace("\\", "/")
            if rel in EXCLUDE_FILES or os.path.splitext(f)[1] in EXCLUDE_EXT:
                continue
            dst = os.path.join(out, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(dirpath, f), dst)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, "w", encoding="utf-8", newline="").write(text)


def sitemap(out, langs):
    s = S.read(os.path.join(S.ROOT, "sitemap.xml"))
    lastmod = (re.search(r"<lastmod>([^<]+)</lastmod>", s) or [None, None])[1]
    extra = []
    for code, _ in langs:
        if code == "en":
            continue
        for page in S.PAGES:
            extra.append("  <url>\n    <loc>%s</loc>\n%s    <priority>0.6</priority>\n  </url>\n"
                         % (url_for(code, page), ("    <lastmod>%s</lastmod>\n" % lastmod) if lastmod else ""))
    write(os.path.join(out, "sitemap.xml"), s.replace("</urlset>", "".join(extra) + "</urlset>"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(S.ROOT, "_site"))
    args = ap.parse_args()
    langs, rtl, eur_on, eur_langs = S.langs_from_i18n_js()
    src = S.english_source()
    prov = S.load_provenance()
    copy_site(args.out)
    # English pages: hreflang alternates only (their own canonical stays)
    for page in S.PAGES:
        s = S.read(os.path.join(S.ROOT, page))
        write(os.path.join(args.out, page), inject_head(s, alternates(langs, page)))
    total_fallback = 0
    summary = []
    for code, _ in langs:
        if code == "en":
            continue
        lang = S.load_lang(code)
        ok = S.status(code, src, lang, prov)
        cur = "eur" if (eur_on and code in eur_langs) else "usd"
        n_fb = 0
        for page in S.PAGES:
            s, report = localise(S.read(os.path.join(S.ROOT, page)), page, code, lang, ok, rtl, langs, cur)
            write(os.path.join(args.out, code, page), s)
            n_fb += len(report)
        total_fallback += n_fb
        summary.append("%s:%d" % (code, n_fb))
    sitemap(args.out, langs)
    print("built %s: %d pages x %d languages; strings left in English (missing/stale): %d  [%s]"
          % (args.out, len(S.PAGES), len(langs) - 1, total_fallback, " ".join(summary)))


if __name__ == "__main__":
    main()
