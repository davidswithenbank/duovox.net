# -*- coding: utf-8 -*-
r"""Check every translation used on the per-language pages.

    python tools/check_translations.py                 # report; exit 1 if anything needs attention
    python tools/check_translations.py --mark KEY ...  # record that KEY's translations (all languages) were made
                                                       # from the CURRENT English - run right after translating
    python tools/check_translations.py --baseline      # first run only: accept every existing translation as-is
    python tools/check_translations.py --meaning [KEY ...]  # also back-check meaning with the AI service
                                                       # (needs OPENAI_API_KEY; changed keys only by default)

Checks, per language and key (English source = the English HTML pages, see sitei18n.py):
  MISSING    no translation                         -> the language page shows English for that line
  STALE      the English changed after translation   -> the language page shows English for that line
  MARKUP     links / bold / tags differ from the English
  NUMBERS    a number in the English is absent (counts, hours, "10+") - digits in any script count
  NAMES      DuoVox / Microsoft Store / Windows / Google Play dropped (warning only)
  PLACEHOLDER a price template lost or duplicated its {p}
Machine checks cannot prove a sentence reads naturally; a native speaker is the only full check.
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitei18n as S  # noqa: E402

DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९๐๑๒๓๔๕๖๗๘๙", "0123456789" * 4)
NAMES = ["DuoVox", "Microsoft Store", "Windows", "Google Play"]


def tags(s):
    return sorted(re.findall(r"<\s*([a-zA-Z0-9]+)", s)), sorted(re.findall(r'href="([^"]*)"', s))


def numbers(s):
    t = html.unescape(s).translate(DIGITS)
    t = re.sub(r"<[^>]+>", " ", t)
    return [n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", t)]


def problems(key, en_text, is_html, tr):
    out = []
    if not is_html and "<" in en_text:
        # A data-i18n (plain-text) element whose English carries a link or bold: every translation is set as
        # text, so the formatting/link is lost in other languages. Known since 6 Oct 2026; fix by making the
        # element data-i18n-html AND re-translating with the markup. Reported, not failed.
        out.append(("PLAINTEXT", "English has %s; translations show without them" % (tags(en_text),)))
    elif is_html:
        if tags(en_text) != tags(tr):
            out.append(("MARKUP", "tags/links %s vs %s" % (tags(en_text), tags(tr))))
    en_nums, tr_nums = numbers(en_text), numbers(tr)
    for n in set(en_nums):
        if tr_nums.count(n) < en_nums.count(n):
            out.append(("NUMBERS", "'%s' missing" % n))
    for ph in ("{p}", "{n}", "{d}"):
        if ph in en_text and tr.count(ph) != 1:
            out.append(("PLACEHOLDER", "%s appears %d times" % (ph, tr.count(ph))))
    squash = lambda x: re.sub(r"[-\s ]+", " ", html.unescape(x))  # noqa: E731  ("Microsoft-Store-Version")
    en_plain, tr_plain = squash(en_text), squash(tr)
    for name in NAMES:
        if name in en_plain and name not in tr_plain:
            out.append(("NAMES", "'%s' not kept" % name))
    return out


def post(payload, key):
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]


def meaning(items, lang_name, key):
    """items: [(id, english, translation)] -> {id: verdict or ''} ('' = faithful)."""
    prompt = ("You review website translations into %s. For each item, compare the translation with the English. "
              "Reply with JSON {\"id\": \"\"} for a faithful translation, or a SHORT English description of the problem "
              "(meaning changed, claim strengthened or weakened, something omitted or added, wrong product term). "
              "Ignore style preferences. Items:\n" % lang_name)
    prompt += json.dumps([{"id": i, "en": e, "tr": t} for i, e, t in items], ensure_ascii=False)
    out = post({"model": "gpt-5.4", "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}}, key)
    return json.loads(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mark", nargs="+", metavar="KEY")
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--meaning", nargs="*", metavar="KEY")
    args = ap.parse_args()
    langs, _, _, _ = S.langs_from_i18n_js()
    src = S.english_source()
    prov = S.load_provenance()
    others = [(c, n) for c, n in langs if c != "en"]

    if args.baseline or args.mark:
        keys = list(src) if args.baseline else args.mark
        unknown = [k for k in keys if k not in src]
        if unknown:
            sys.exit("not on any localised page: %s" % unknown)
        for code, _ in others:
            lang = S.load_lang(code)
            rec = prov.setdefault(code, {})
            for k in keys:
                if k in lang and (args.mark or k not in rec):
                    rec[k] = S.h(src[k][0])
        S.save_provenance(prov)
        print("recorded %d key(s) x %d languages" % (len(keys), len(others)))
        return

    errors = warnings = 0
    stale_keys = set()
    # Text with no translation key at all stays English on EVERY language page (this hid ~1,000 words of the
    # home page from 26 Mar to 6 Oct 2026, because every check above only looks at keyed text).
    for page in S.PAGES:
        for t in S.unkeyed_text(S.read(os.path.join(S.ROOT, page))):
            print("  UNKEYED  %s: %s" % (page, t[:90]))
            errors += 1
    names = S.load_language_names()
    table = set(re.findall(r'<span class="lc-n"><b>([^<]+)</b>', S.read(os.path.join(S.ROOT, "languages.html"))))
    for code, _ in others:
        for n in sorted(table - set(names.get(code, {}))):
            print("  MISSING  %s language name: %s" % (code, n))
            errors += 1
    for code, name in others:
        lang = S.load_lang(code)
        st = S.status(code, src, lang, prov)
        lines = []
        for key, state in st.items():
            if state != "ok":
                lines.append("  %-8s %s" % (state.upper(), key))
                stale_keys.add(key)
                errors += 1
                continue
            for kind, msg in problems(key, src[key][0], src[key][1], lang[key]):
                lines.append("  %-8s %s: %s" % (kind, key, msg))
                if kind in ("NAMES", "PLAINTEXT"):
                    warnings += 1
                else:
                    errors += 1
        if lines:
            print("%s (%s)" % (code, name))
            print("\n".join(lines))

    if args.meaning is not None:
        key = os.environ.get("OPENAI_API_KEY", "")
        if not key:
            sys.exit("--meaning needs OPENAI_API_KEY")
        targets = args.meaning or sorted(stale_keys) or []
        if not targets:
            print("meaning: nothing changed to check (name keys to check them anyway)")
        for code, name in others:
            lang = S.load_lang(code)
            items = [(k, html.unescape(src[k][0]), lang[k]) for k in targets if k in lang]
            if not items:
                continue
            verdicts = meaning(items, name, key)
            for k, v in verdicts.items():
                if v:
                    print("  MEANING  %s %s: %s" % (code, k, v))
                    errors += 1

    print("translations: %d problem(s), %d warning(s) across %d languages x %d strings"
          % (errors, warnings, len(others), len(src)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
