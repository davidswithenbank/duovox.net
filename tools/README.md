# duovox.net language pages

The site's English pages are the source. On every push, GitHub Actions (`.github/workflows/pages.yml`) runs
`build_lang_pages.py`, which builds a copy of each page in `sitei18n.PAGES` for every language in `i18n.js`
(`/es/`, `/fr/`, ...) and deploys the result. The repository itself never contains those copies.

## When you change English text

1. Edit the English page as usual. New text must carry a `data-i18n` (plain text) or `data-i18n-html` key.
2. `python tools/translate_missing.py` (needs `OPENAI_API_KEY`) translates every missing or out-of-date line
   into all languages and checks each result.
3. `python tools/check_translations.py --meaning` back-checks the meaning of what changed.
4. `python tools/build_lang_pages.py --out <folder>` and preview, then push.

If step 2 is skipped, nothing breaks: the language pages show the new English line instead of an old
translation, and the "translations" job in the GitHub run fails, so GitHub emails the owner.

## What the checks cover (`check_translations.py`)

| Check | Meaning |
|---|---|
| MISSING / STALE | no translation, or the English changed after it was translated (`lang/_translated_from.json`) |
| UNKEYED | visible text with no key at all (would stay English everywhere) |
| MARKUP | links/bold differ from the English |
| NUMBERS | a number in the English is missing |
| PLACEHOLDER | `{p}` `{n}` `{d}` lost or doubled |
| PLANNAME | a plan named in English where the app uses its own name (`lang/_plan_names.json`) |
| NAMES (warning) | DuoVox / Microsoft Store / Windows / Google Play dropped |
| PLAINTEXT (warning) | a plain-text element whose English has a link or bold the translations cannot carry |

Machine checks cannot prove a sentence reads naturally; a native speaker review is the only full check.

## Prices

Numbers are never translated. The build reads them from the English page's `data-price-*` attributes, which
the admin price publisher keeps current, and puts them into translated wording (`PRICE_TEMPLATES`).
