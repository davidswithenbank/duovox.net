# -*- coding: utf-8 -*-
r"""Translate every string that is MISSING or STALE (or fails a check) on the per-language pages.

    set OPENAI_API_KEY, then:
    python tools/translate_missing.py               # all languages
    python tools/translate_missing.py --lang es fr   # some languages
    python tools/translate_missing.py --dry-run      # list what would be translated

The workflow after ANY English text edit: run this, then `python tools/check_translations.py --meaning`
(back-check), then build/preview, then push. Each result must pass the same checks as check_translations.py
(markup, numbers, placeholders, product names, the app's plan names) or it is retried once with the failure
explained, and left untranslated (the page then shows English for that line) if it still fails.
Writes lang/<code>.json and records provenance (lang/_translated_from.json) for what it wrote.
"""
import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitei18n as S  # noqa: E402
import check_translations as C  # noqa: E402

KEEP = ["DuoVox", "Microsoft Store", "Google Play", "Windows", "Google Translate", "iTranslate",
        "Microsoft Translator", "DeepL", "DeepL Voice", "Teams", "Zoom", "Google Meet", "WhatsApp",
        "Pay-As-You-Go", "SRT", "VTT", "David Arthur Software", "Converse", "Pixel"]


def prompt(lang_name, plans, items):
    rules = (
        "Translate these strings from a software product's website from English into %s.\n"
        "Return ONLY a JSON object mapping each id to its translation.\n"
        "Rules:\n"
        "- Plain, natural website language for a %s reader. Same meaning: never strengthen or weaken a claim, keep every "
        "disclaimer and limitation (e.g. 'not a certified interpreter', 'not yet available in the EU or EEA', "
        "'Paid plans', 'Partial').\n"
        "- Keep these names exactly as written: %s.\n"
        "- The app's plan names in this language are: Free = \"%s\", Standard = \"%s\", Professional = \"%s\". Use exactly "
        "these whenever the English names a plan. Pay-As-You-Go stays in English.\n"
        "- Keep every number, and keep placeholders {p} {n} {d} exactly once each.\n"
        "- Items marked html=true: keep exactly the same HTML tags and attributes (same href values), translating only "
        "the visible text. Items marked html=false: plain text, no HTML.\n"
        "- A cell like '✓ Turn-based' keeps its tick mark markup as given.\n"
        % (lang_name, lang_name, ", ".join(KEEP), plans.get("Free", "Free"), plans.get("Standard", "Standard"),
           plans.get("Professional", "Professional")))
    return rules + "Items:\n" + json.dumps(items, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revise", metavar="JSON", help='{"lang": {"key": "what is wrong"}} - re-translate these too, '
                    "with the note (e.g. genuine findings from check_translations.py --meaning)")
    args = ap.parse_args()
    revise = json.loads(S.read(args.revise)) if args.revise else {}
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key and not args.dry_run:
        sys.exit("OPENAI_API_KEY is not set")
    langs, _, _, _ = S.langs_from_i18n_js()
    src = S.english_source()
    prov = S.load_provenance()
    plan_names = json.loads(S.read(os.path.join(S.LANG_DIR, "_plan_names.json")))
    total_ok = total_fail = 0
    for code, name in langs:
        if code == "en" or (args.lang and code not in args.lang):
            continue
        lang = S.load_lang(code)
        plans = plan_names.get(code, {})
        st = S.status(code, src, lang, prov)
        todo = [k for k, v in st.items() if v != "ok"]
        todo += [k for k, v in st.items() if v == "ok" and k not in todo and
                 any(kind != "NAMES" and kind != "PLAINTEXT" for kind, _ in C.problems(k, src[k][0], src[k][1], lang[k], plans))]
        feedback = {}
        for k, note in revise.get(code, {}).items():
            if k in src:
                feedback[k] = note + (" (current translation: %s)" % lang[k] if k in lang else "")
                if k not in todo:
                    todo.append(k)
        if not todo:
            continue
        print("%s: %d string(s)" % (code, len(todo)))
        if args.dry_run:
            continue
        done = {}
        for attempt in (1, 2):
            pending = [k for k in todo if k not in done]
            for i in range(0, len(pending), 40):
                batch = pending[i:i + 40]
                items = [{"id": k, "html": src[k][1],
                          "en": src[k][0].strip() if src[k][1] else S.norm(re.sub(r"<[^>]+>", "", src[k][0])),
                          **({"previous_problem": feedback[k]} if k in feedback else {})} for k in batch]
                out = json.loads(C.post({"model": "gpt-5.4", "messages": [{"role": "user", "content": prompt(name, plans, items)}],
                                         "response_format": {"type": "json_object"}}, key))
                for k in batch:
                    tr = out.get(k)
                    if not isinstance(tr, str) or not tr.strip():
                        feedback[k] = "no translation returned"
                        continue
                    probs = []
                    if not src[k][1]:
                        tr = html.unescape(tr)
                        if "<" in tr:
                            probs.append("plain text only - no HTML tags")
                    probs += [m for kind, m in C.problems(k, src[k][0], src[k][1], tr, plans) if kind not in ("NAMES", "PLAINTEXT")]
                    if probs:
                        feedback[k] = "; ".join(probs)
                    else:
                        done[k] = tr
        for k, tr in done.items():
            lang[k] = tr
            prov.setdefault(code, {})[k] = S.h(src[k][0])
        failed = [k for k in todo if k not in done]
        for k in failed:
            print("  NOT TRANSLATED %s: %s" % (k, feedback.get(k, "?")))
        p = os.path.join(S.LANG_DIR, code + ".json")
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(lang, ensure_ascii=False, indent=2) + "\n")
        os.replace(tmp, p)
        S.save_provenance(prov)
        total_ok += len(done)
        total_fail += len(failed)
    print("translated %d string(s); %d left in English" % (total_ok, total_fail))


if __name__ == "__main__":
    main()
