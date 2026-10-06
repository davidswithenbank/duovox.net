# -*- coding: utf-8 -*-
"""One-off (6 Oct 2026): give translation keys to the comparison section (re-checked the same day).
Product and company names stay untranslated (no key); cells that are only a dash or a tick get no key.
Keys: home.cmp.<n> in document order. Refuses to run twice.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = {"DuoVox", "Google Translate", "iTranslate", "Microsoft Translator", "DeepL", "Feature"}
EL = re.compile(r'<(h2|p|th|td)\b([^>]*)>(.*?)</\1>', re.S)


def main():
    p = os.path.join(ROOT, "index.html")
    raw = io.open(p, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")
    if 'data-i18n="home.cmp.1"' in s:
        sys.exit("already keyed")
    a = s.index('<section class="section" id="compare"')
    b = s.index("</section>", a)
    n = [0]

    def sub(m):
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        plain = re.sub(r"<[^>]+>", "", inner)
        plain = re.sub(r"&[a-z]+;|&#\d+;", " ", plain).strip()
        if "data-i18n" in attrs or not re.search(r"[A-Za-z]{2}", plain) or plain in NAMES:
            return m.group(0)
        n[0] += 1
        kind = "data-i18n-html" if "<" in inner else "data-i18n"
        return '<%s%s %s="home.cmp.%d">%s</%s>' % (tag, attrs, kind, n[0], inner, tag)

    region = EL.sub(sub, s[a:b])
    s = s[:a] + region + s[b:]
    io.open(p + ".tmp", "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    os.replace(p + ".tmp", p)
    print("keyed %d elements in the comparison section" % n[0])


main()
