r"""build_languages_page.py — generate languages.html from the APP'S OWN capability maps.

⭐⭐⭐ WHY GENERATED, NOT HAND-WRITTEN. This page makes a public claim about which languages work on
which tier. Hand-typing it guarantees it drifts the first time a model is added or a provider map
changes — and a stale claim here is exactly the kind of thing a reviewer or a refund request is
built on. Re-run this script whenever the maps change; it reads:

  Free (offline)  speech      = DASTranscribe.Core\Services\VoskModelManager.cs
                  translation = CaptionOverlay\Services\TranslationModelManager.cs
  Standard        speech      = DASTranscribe.Core\Services\DeepgramSpeechClient.cs
  Professional    speech      = CaptionOverlay\Services\AzureSpeechClient.cs

⛔ THE PARTIAL STATES ARE THE WHOLE POINT. Hindi has offline speech but NO offline translation;
Hebrew, Bulgarian and Serbian have no offline model at all; Serbian is Professional-only. A page
that showed a flat "20 languages" per tier would be the very misconception it exists to prevent.

⚠ This page REDUCES surprise; it does not replace the in-app fix (BLK-09) — a user who never visits
the site still selects Hebrew on Free and is told nothing.

⛔⛔⛔ 2026-08-29 — THE ROW SET USED TO BE HAND-TYPED AND IT WAS WRONG BY 29 LANGUAGES.
The tier COLUMNS were always read from the app's maps, exactly as this docstring promised. The ROW
SET was a hardcoded list of 20 that I wrote — so the page silently claimed we do not support
Romanian, Thai, Vietnamese, Dutch, Czech, Swedish, Danish, Norwegian, Finnish, Hungarian, Croatian,
Tamil, Telugu, Urdu and 15 more, all of which the app's picker offers. Caught before publishing.
⭐⭐⭐ THE LESSON: "generated from the source of truth" is a claim about EVERY axis of the output.
Deriving the columns and typing the rows is not a generated page — it is a hand-written page with a
generated decoration, and the docstring's own warning did not save it.
BOTH axes now come from the app:
    rows  = MainViewModel.LanguagesEnglish   (what the picker actually offers)
    codes = MainViewModel.LanguageNameToCode (the app's own name->code switch, never re-implemented)
"""
import datetime
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
# The checkout this reads from. Override with DUOVOX_APP_DIR elsewhere.
APP = os.environ.get("DUOVOX_APP_DIR", r"C:\Users\david\Documents on C\DuoVox Desktop App")
if not os.path.isdir(APP):
    sys.exit("app directory not found: %s (set DUOVOX_APP_DIR)" % APP)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "languages.html")


def read(rel):
    return io.open(os.path.join(APP, rel), encoding="utf-8-sig", errors="replace").read()


def keys_of_map(src, decl):
    i = src.find(decl)
    if i < 0:
        return set()
    block = src[i:i + 20000]
    end = block.find("};")
    if end > 0:
        block = block[:end]
    return {m.group(1).lower() for m in re.finditer(r'\["([a-z]{2}(?:-[a-z]{2})?)"\]', block, re.I)}


AZ = keys_of_map(read(r"CaptionOverlay\Services\AzureSpeechClient.cs"), "Dictionary<string, string> LocaleMap")
DG = keys_of_map(read(r"DASTranscribe.Core\Services\DeepgramSpeechClient.cs"), "Dictionary<string, string> DeepgramToLocaleMap")
vosk = read(r"DASTranscribe.Core\Services\VoskModelManager.cs")
VOSK = {m.group(1).lower() for m in re.finditer(r'\["([a-z]{2})"\]\s*=\s*(?:new|\()', vosk, re.I)}
VOSK |= {m.group(1).lower() for m in re.finditer(r'\{\s*"([a-z]{2})"\s*,\s*(?:new|")', vosk, re.I)}
mt = read(r"CaptionOverlay\Services\TranslationModelManager.cs")
MT = {m.group(1).lower() for m in re.finditer(r'\["([a-z]{2})"\]\s*=\s*\(\s*"', mt)}
MT.add("en")   # English is the PIVOT of every Bergamot pair, never a key

if min(len(AZ), len(DG), len(VOSK), len(MT)) < 5:
    sys.exit("a capability map parsed to nearly nothing — refusing to publish a vacuous page")

# ── the row set, read from the app (NOT typed here) ──────────────────────────
mv = read(r"CaptionOverlay\ViewModels\MainViewModel.cs")

# ⛔ STRIP C# COMMENTS FIRST. This regex hunts for a code pattern, and on 2026-09-04 a COMMENT in
# MainViewModel.cs that documented this very coupling — it quoted "LanguagesEnglish = { ... };" to
# warn future editors not to fence the array — matched ahead of the real declaration. group(1) was
# then " ... ", the picker parsed to ZERO entries, and the build refused. The guard did its job, but
# the cause was a gate reading PROSE as CODE. Documenting a coupling must not break it.
_mv_code = re.sub(r"//[^\n]*", "", mv)

_m = re.search(r"LanguagesEnglish\s*=\s*\{(.*?)\};", _mv_code, re.S)
if not _m:
    sys.exit("could not find LanguagesEnglish — refusing to guess the language list")
PICKER = re.findall(r'"([^"]+)"', _m.group(1))

# Same reason as above: read CODE, not comments.
_i = _mv_code.find('"Romanian" => "ro"')
if _i < 0:
    sys.exit("could not find LanguageNameToCode — refusing to re-implement it")
_blk = _mv_code[_mv_code.rfind("switch", 0, _i):_mv_code.find("};", _i)]
NAME2CODE = {k: v.lower() for k, v in re.findall(r'"([^"]+)"\s*=>\s*"([a-z-]{2,7})"', _blk)}

# ⛔ NON-VACUITY: both lists must be substantial AND every picker entry must resolve.
# A silent miss here is exactly the failure this rewrite exists to prevent.
if len(PICKER) < 40 or len(NAME2CODE) < 40:
    sys.exit("picker=%d name2code=%d — one list parsed to nearly nothing" % (len(PICKER), len(NAME2CODE)))
_unmapped = [n for n in PICKER if n not in NAME2CODE]
if _unmapped:
    sys.exit("picker names with no code in the app's own switch: %s" % _unmapped)

# Endonyms are presentational only — no capability claim rides on them, and a missing one
# degrades to the English name rather than inventing a translation.
NATIVE = {
    "en": "English", "ru": "Русский",
    "uk": "Українська",
    "es": "Español", "fr": "Français", "de": "Deutsch", "it": "Italiano",
    "pt": "Português", "zh": "中文(简体)", "zh-tw": "中文(繁體)",
    "ja": "日本語", "ko": "한국어", "ar": "العربية",
    "hi": "हिन्दी", "tr": "Türkçe", "pl": "Polski",
    "fa": "فارسی", "el": "Ελληνικά",
    "he": "עברית", "bg": "Български",
    "sr": "Српски", "ro": "Română", "hu": "Magyar",
    "cs": "Čeština", "sk": "Slovenčina", "hr": "Hrvatski", "sl": "Slovenščina",
    "lt": "Lietuvių", "lv": "Latviešu", "et": "Eesti", "nl": "Nederlands",
    "sv": "Svenska", "no": "Norsk", "da": "Dansk", "fi": "Suomi", "ca": "Català",
    "eo": "Esperanto", "vi": "Tiếng Việt", "th": "ไทย",
    "id": "Bahasa Indonesia", "gu": "ગુજરાતી",
    "ur": "اردو", "uz": "Oʻzbek", "bn": "বাংলা",
    "tg": "Тоҷикӣ", "ta": "தமிழ்",
    "te": "తెలుగు", "kz": "Қазақша",
    "ky": "Кыргызча",
}
LANGS = [(NAME2CODE[n], n, NATIVE.get(NAME2CODE[n], n)) for n in PICKER]
N_TOTAL = len(LANGS)


def base(c):
    """Offline models are keyed on the base code; zh-tw shares zh's on-device model."""
    return c.split("-")[0]


def free_state(c, online):
    v, t = base(c) in VOSK, base(c) in MT
    if v and t:
        return "yes", "Captions and translation, fully on your device"
    if v and not t:
        return "part", "Captions on your device \u2014 translation needs an online plan"
    if online:
        return "no", "Not available offline \u2014 needs an online plan"
    # No on-device model AND no online engine: naming a plan here would be a false promise.
    if base(c) in MT:
        return "no", "Can be translated INTO, but speech in this language is not captioned"
    return "no", "Not captioned on any plan"


rows_free, rows_std, rows_pro = [], [], []
n_free = n_part = 0
for code, eng, native in LANGS:
    _online = (code in DG) or (code in AZ)
    st, note = free_state(code, _online)
    if st == "yes":
        n_free += 1
    if st == "part":
        n_part += 1
    rows_free.append((code, eng, native, st, note))
    if code in DG:
        _snote = "Included"
    elif code in AZ:
        _snote = "Not available on Standard \u2014 available on Professional"
    else:
        _snote = "Not captioned on any plan"
    rows_std.append((code, eng, native, "yes" if code in DG else "no", _snote))
    rows_pro.append((code, eng, native, "yes" if code in AZ else "no",
                     "Included" if code in AZ else ("Can be translated INTO, but speech in this language is not captioned"
                      if base(code) in MT else "Not captioned on any plan")))

n_std = sum(1 for r in rows_std if r[3] == "yes")
n_pro = sum(1 for r in rows_pro if r[3] == "yes")

ICON = {"yes": "\u2713", "part": "\u2022", "no": "\u2013"}


def col(title, sub, count, rows, key):
    """One plan's card, listing ONLY what that plan supports.

    ⭐ 2026-09-04, David: "Instead of advertising what we don't support, wouldn't it be better to
    just show what we do support (it's a psychological selling thing)?" So the "no" rows are gone.
    Each column is now a true list of what that plan DOES, and a reader comparing columns still
    learns where a missing language lives — Bengali is absent from Free and present under
    Professional, which answers the question without a column of dashes to read past.

    ⛔ THE HONESTY THIS MUST NOT COST. Two of the 49, Latvian and Lithuanian, are captioned on NO
    plan (they are translation targets only). Dropping the "no" rows makes them vanish from the page
    entirely, so the page would advertise 49 while 47 are actually obtainable. The footer names them
    explicitly — removing the negatives is a presentation change, not a licence to imply coverage
    that does not exist.
    """
    shown = [r for r in rows if r[3] != "no"]
    li = []
    for code, eng, native, st, note in shown:
        li.append(
            '        <li class="lc-%s"><span class="lc-i" aria-hidden="true">%s</span>'
            '<span class="lc-n"><b>%s</b><i>%s</i></span>'
            '<span class="lc-note">%s</span></li>' % (st, ICON[st], eng, native, note))
    # The headline number is what the reader can USE on this plan, so it counts what is listed.
    return (
        '    <div class="lc-col">\n'
        '      <h2 data-i18n="lang.%s.title">%s</h2>\n'
        '      <p class="lc-sub" data-i18n="lang.%s.sub">%s</p>\n'
        '      <p class="lc-count"><strong>%d</strong> languages</p>\n'
        '      <ul class="lc-list">\n%s\n      </ul>\n'
        '    </div>' % (key, title, key, sub, len(shown), "\n".join(li)))


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Language coverage by plan - DuoVox | David Arthur Software</title>
    <meta name="description" content="Exactly which languages DuoVox supports on the Free, Standard and Professional plans - including which work fully offline and which need an online plan.">
    <link rel="icon" type="image/png" href="icon.png">
    <link rel="stylesheet" href="style.css">
    <style>
      /* 120px TOP, NOT 0. The nav is position:fixed, top:0, height:64px, so a wrapper with no top
         padding slides its h1 and intro underneath it - which is exactly what this page did.
         120px is not a guess: it is what .legal already uses in style.css for the same problem, so
         the pages agree rather than each carrying its own magic number. */
      .lc-wrap{max-width:1180px;margin:0 auto;padding:120px 20px 64px}
      .lc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;align-items:start}
      .lc-col{border:1px solid rgba(128,128,128,.28);border-radius:10px;padding:20px 18px}
      .lc-col h2{margin:0 0 4px;font-size:1.25rem}
      .lc-sub{margin:0 0 10px;opacity:.75;font-size:.92rem;min-height:2.6em}
      .lc-count{margin:0 0 14px;font-size:.95rem;opacity:.9}
      .lc-count strong{font-size:1.35rem}
      .lc-list{list-style:none;margin:0;padding:0}
      .lc-list li{display:grid;grid-template-columns:22px 1fr;gap:2px 8px;
                  padding:7px 0;border-top:1px solid rgba(128,128,128,.16)}
      .lc-list li:first-child{border-top:none}
      .lc-i{font-weight:700;line-height:1.5}
      .lc-n b{font-weight:600}
      .lc-n i{font-style:normal;opacity:.6;margin-left:7px;font-size:.9em}
      .lc-note{grid-column:2;font-size:.83rem;opacity:.68;line-height:1.35}
      .lc-yes .lc-i{color:#2a8a5f}
      .lc-part .lc-i{color:#b07a17}
      .lc-no .lc-i{color:#8d8d8d}
      .lc-no .lc-n b,.lc-no .lc-n i{opacity:.55}
      .lc-key{display:flex;flex-wrap:wrap;gap:18px;margin:22px 0 6px;font-size:.9rem;opacity:.8}
      /* Full container width, NOT max-width:74ch. 74ch is the classic readable-measure rule and it
         is right for a page of running prose - but here the paragraphs sit directly beneath a
         1180px three-column grid, so a half-width block reads as broken rather than considered.
         Matching the grid edge is what looks deliberate in this layout. */
      .lc-foot{margin-top:26px;font-size:.92rem;opacity:.8}
      @media(max-width:900px){.lc-grid{grid-template-columns:1fr}.lc-sub{min-height:0}}
    </style>
</head>
<body>

<!-- Navigation -->
<nav class="nav" aria-label="Main navigation">
    <div class="nav-inner">
        <a href="index.html" class="nav-brand">
            <img src="icon.png" alt="DuoVox icon">
            DuoVox
        </a>
        <button class="nav-toggle" aria-label="Menu" onclick="this.nextElementSibling.classList.toggle('open')"><span></span><span></span><span></span></button>
        <ul class="nav-links">
            <li><a href="index.html" data-i18n="nav.home">Home</a></li>
            <li><a href="index.html#pricing" data-i18n="nav.pricing">Pricing</a></li>
            <li><a href="languages.html" data-i18n="nav.languages">Languages</a></li>
            <li><a href="security.html" data-i18n="nav.security">Security</a></li>
            <li><a href="privacy.html" data-i18n="nav.privacy">Privacy</a></li>
            <li><a href="terms.html" data-i18n="nav.terms">Terms</a></li>
        </ul>
    </div>
</nav>

<div class="lc-wrap">
    <h1 data-i18n="lang.title">Language coverage by plan</h1>
    <p data-i18n="lang.intro">Each plan below lists the languages it supports. The Free plan runs
    entirely on your device, so it covers the languages we can ship a voice model for; the online
    plans reach considerably further. Find your language, and you can see at a glance which plan
    you need.</p>

    <div class="lc-key">
      <span data-i18n="lang.key.yes">&#10003; Captions and translation</span>
      <span data-i18n="lang.key.part">&bull; Captions on your device, translation needs an online plan</span>
    </div>

  <div class="lc-grid">
__COLS__
  </div>

  <p class="lc-foot" data-i18n="lang.foot.pair">Both sides of a conversation need to be supported by
  the plan you choose. If either language is unavailable on a plan, that speaker will not be
  captioned.</p>
  <p class="lc-foot" data-i18n="lang.foot.translateonly">{TRANSLATE_ONLY_SENTENCE}</p>
  <p class="lc-foot" data-i18n="lang.foot.offline">Free runs entirely on your device and never sends
  audio anywhere. Standard and Professional use online services for higher accuracy, and fall back
  to on-device processing if the connection drops.</p>
  <p class="lc-foot" data-i18n="lang.foot.accuracy"><strong>Supported does not mean identical
  accuracy.</strong> Accuracy varies by language, accent, microphone and background noise, and some
  languages perform noticeably better than others on the same plan. Treat this page as a list of
  what is available, not a guarantee of how well it will perform for you.</p>
  <p class="lc-foot" data-i18n="lang.foot.change">Language availability depends on third-party
  services and on-device models and <strong>may change without notice</strong>. We update this page
  when it does; the date below shows when it was last generated.</p>
  <p class="lc-foot" data-i18n="lang.foot.aid">DuoVox is an assistive aid, not a substitute for a
  qualified human interpreter, and is not certified for regulated medical or legal use. See our
  <a href="terms.html">Terms of Use</a>.</p>
  <p class="lc-foot" data-i18n="lang.foot.variants">Regional variants (for example Traditional
  Chinese and British English) are selected separately in the app and are not listed individually
  here.</p>
  <p class="lc-foot"><a href="index.html#pricing" data-i18n="lang.foot.cta">See plans and pricing</a></p>
  <p class="lc-foot lc-stamp">Last updated __STAMP__</p>
</div>

<footer class="footer">
    <div class="footer-inner">
        <div class="footer-links">
            <a href="privacy.html" data-i18n="footer.privacy">Privacy Policy</a>
            <a href="terms.html" data-i18n="footer.terms">Terms of Service</a>
            <a href="security.html" data-i18n="nav.security">Security</a>
            <a href="contact.html" data-i18n="footer.contact">Contact</a>
        </div>
        <p class="footer-company" data-i18n="footer.copyright">&copy; 2026 David Arthur Software (DAS). All rights reserved.</p>
    </div>
</footer>

<script src="i18n.js"></script>
<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "6da9362d8d7f49fc913578849ffbc7bb"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
"""

cols = "\n".join([
    col("Free", "Runs entirely on your device. No internet needed, no audio ever leaves your computer.",
        n_free, rows_free, "free"),
    col("Standard", "Online accuracy for everyday interpreting, with on-device fallback.",
        n_std, rows_std, "standard"),
    col("Professional", "Our most accurate engine, for high-stakes and specialist work.",
        n_pro, rows_pro, "professional"),
])

# ⛔⛔⛔ 2026-09-02 — __STAMP__ SHIPPED TO THE LIVE SITE UNSUBSTITUTED and sat there visible to every
# visitor, directly under a sentence telling them "the date below shows when it was last generated".
# `import datetime` was present from the first version and never used. Nothing failed: the file was
# written, the page rendered, and every check asked "is languages.html served?" rather than "does it
# read correctly?". ⭐⭐⭐ A TEMPLATE MISS IS SILENT BY CONSTRUCTION — the only thing that catches it
# is a guard that runs AFTER substitution and looks for leftovers. Hence the assertion below.
STAMP = datetime.date.today().strftime("%-d %B %Y" if os.name != "nt" else "%#d %B %Y")

# ⭐ DERIVED, NEVER TYPED. The columns now list only what each plan supports, so a language served
# by no plan at all disappears from the page completely. Naming those languages is what keeps the
# page honest — and hand-typing "Latvian and Lithuanian" would silently become a lie the day a
# model ships for either. This sentence is built from the same maps the columns are.
_translate_only = [eng for (code, eng, native, st, note) in rows_free
                   if st == "no"
                   and code not in DG and code not in AZ
                   and base(code) in MT]
_never = [eng for (code, eng, native, st, note) in rows_free
          if st == "no" and code not in DG and code not in AZ and base(code) not in MT]

if _translate_only:
    _names = (" and ".join(_translate_only) if len(_translate_only) < 3
              else ", ".join(_translate_only[:-1]) + " and " + _translate_only[-1])
    _word = "One exception" if len(_translate_only) == 1 else "Two exceptions" if len(_translate_only) == 2 \
            else "%d exceptions" % len(_translate_only)
    _plural = "" if len(_translate_only) == 1 else "s"
    _sentence = ("%s worth naming: <b>%s</b> can be translated <i>into</i>, so you can read %s, but "
                 "DuoVox cannot yet caption speech in %s &mdash; on any plan."
                 % (_word, "</b> and <b>".join(_translate_only), _names,
                    "it" if len(_translate_only) == 1 else "either" if len(_translate_only) == 2 else "them"))
else:
    _sentence = ("Every language listed above can be both captioned and translated on at least one "
                 "plan.")
if _never:
    _sentence += (" <b>%s</b> %s offered in the app but cannot currently be captioned or translated."
                  % (", ".join(_never), "is" if len(_never) == 1 else "are"))

html = (HTML.replace("__COLS__", cols)
            .replace("{TRANSLATE_ONLY_SENTENCE}", _sentence)
            .replace("{N_TOTAL}", str(N_TOTAL))
            .replace("__STAMP__", STAMP))

# Non-vacuity control: prove the detector can actually fire before trusting it to say "clean".
_PLACEHOLDER = re.compile(r"__[A-Z][A-Z0-9_]*__|\{[A-Z][A-Z0-9_]*\}")
assert _PLACEHOLDER.search("x __STAMP__ y") and _PLACEHOLDER.search("x {N_TOTAL} y"), \
    "placeholder detector is vacuous — it cannot match the very tokens this file uses"
_left = sorted(set(_PLACEHOLDER.findall(html)))
if _left:
    sys.exit("REFUSING TO WRITE: %d unsubstituted placeholder(s) would ship to the live site: %s"
             % (len(_left), ", ".join(_left)))

io.open(OUT, "w", encoding="utf-8", newline="\n").write(html)

print("wrote %s" % OUT)
print("  rows (from the app picker): %d" % N_TOTAL)
print("  Free  fully supported: %d   partly: %d   unavailable: %d"
      % (n_free, n_part, N_TOTAL - n_free - n_part))
print("  Standard: %d / %d      Professional: %d / %d"
      % (n_std, N_TOTAL, n_pro, N_TOTAL))
# A language the picker offers that NO tier can serve is a defect worth seeing,
# not a row to render quietly.
_dead = [rf[1] for rf, rs, rp in zip(rows_free, rows_std, rows_pro)
         if rf[3] == "no" and rs[3] == "no" and rp[3] == "no"]
if _dead:
    print("  !! offered by the picker but supported by NO tier (%d): %s"
          % (len(_dead), ", ".join(_dead)))
print("  (generated from the shipped maps — re-run whenever a language or provider map changes)")
