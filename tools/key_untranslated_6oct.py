# -*- coding: utf-8 -*-
"""One-off (6 Oct 2026): give translation keys to home-page text that never had any (added in March without i18n),
and to the closing paragraph of security.html. The comparison table is keyed separately, after its claims are checked.
Each section's elements get keys in document order: home.<section>.<n>. Elements that already carry a key, or
whose text is only a product name, are left alone. Run once; it refuses to run twice.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rw(name, fn):
    p = os.path.join(ROOT, name)
    raw = io.open(p, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    new = fn(raw.replace("\r\n", "\n")).replace("\n", nl)
    io.open(p + ".tmp", "w", encoding="utf-8", newline="").write(new)
    os.replace(p + ".tmp", p)


SKIP_TEXT = {"DuoVox", "Windows"}
EL = re.compile(r'<(h2|h3|p|span|button|a)\b([^>]*)>(.*?)</\1>', re.S)


def key_region(region, prefix):
    n = [0]

    def sub(m):
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        plain = re.sub(r"<[^>]+>", "", inner).strip()
        if "data-i18n" in attrs or "data-i18n" in inner or not re.search(r"[A-Za-z]{2}", plain) or plain in SKIP_TEXT:
            return m.group(0)
        if re.search(r'class="(trust-icon|step-number|audience-icon|check|check-muted)"', attrs):
            return m.group(0)
        n[0] += 1
        kind = "data-i18n-html" if "<" in inner else "data-i18n"
        return '<%s%s %s="%s.%d">%s</%s>' % (tag, attrs, kind, prefix, n[0], inner, tag)
    return EL.sub(sub, region), n[0]


def section(s, start_marker, end_marker, prefix, counts):
    a = s.index(start_marker)
    b = s.index(end_marker, a)
    new, n = key_region(s[a:b], prefix)
    counts[prefix] = n
    return s[:a] + new + s[b:]


def index(s):
    if 'data-i18n="home.how.1"' in s or 'home.how.s1.text' in s:
        sys.exit("already keyed")
    counts = {}
    # step 1 holds a keyed link: wrap only its own sentence
    old = ('<p>Select a primary language and a target language. DuoVox offers 49 languages &mdash; 43 on Professional, '
           '33 on Standard, and 30 that work offline on Free.\n')
    assert s.count(old) == 1, "step 1 text changed"
    s = s.replace(old, '<p><span data-i18n="home.how.s1.text">Select a primary language and a target language. DuoVox offers '
                       '49 languages &mdash; 43 on Professional, 33 on Standard, and 30 that work offline on Free.</span>\n')
    s = section(s, '<section class="trust-badges">', "</section>", "home.badge", counts)
    s = section(s, '<section class="section" id="how-it-works"', "</section>", "home.how", counts)
    s = section(s, '<section class="section" id="who-its-for"', "</section>", "home.who", counts)
    s = section(s, '<h2 class="section-title">Common Questions</h2>', '<section class="section disclaimer-section">', "home.faq", counts)
    s = section(s, '<h2 class="section-title" style="font-size:1.6rem; margin-bottom:1rem;">', "</section>", "home.final", counts)
    for old, new in [('<a href="#main-content" class="skip-link">Skip to content</a>',
                      '<a href="#main-content" class="skip-link" data-i18n="a11y.skip">Skip to content</a>')]:
        assert s.count(old) == 1, old
        s = s.replace(old, new)
    m = re.search(r'(<a [^>]*>)(See Plans &amp; Pricing)(</a>)', s)
    if m and "data-i18n" not in m.group(1):
        s = s[:m.start()] + m.group(1)[:-1] + ' data-i18n="home.cta.plans">' + m.group(2) + m.group(3) + s[m.end():]
        counts["home.cta.plans"] = 1
    print("index.html keyed:", counts)
    return s


def security(s):
    old = '<p style="margin-top:2rem;">For our full data handling policy'
    assert s.count(old) == 1, "security closing paragraph changed"
    s = s.replace(old, '<p style="margin-top:2rem;" data-i18n-html="sec.closing">For our full data handling policy')
    print("security.html keyed: sec.closing")
    return s


rw("index.html", index)
rw("security.html", security)
