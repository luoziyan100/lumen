# i18n/ — UI languages
React useSyncExternalStore + Intl; no i18n library

Every string a person reads in the UI comes from one typed catalog per language. English is the default and the source of the `Messages` type.

```text
i18n/
├── index.ts        # the only entry: t(), useT(), useLocale(), setLocale, bootstrapLocale, localeTag, number/date helpers
├── store.ts        # lumen:locale.v1 = { version: 1, locale }; unknown values fall back to English
├── format.ts       # plural / formatNumber / formatDateTime / formatRelative, all through Intl
├── errors.ts       # serviceErrorText (service code → UI text), errorText (any thrown value)
└── locales/
    ├── index.ts    # LOCALES: id, BCP 47 tag, native name, loader; DEFAULT_LOCALE = 'en'
    ├── en.ts       # en and `type Messages = typeof en`
    ├── zh.ts       # zh: Messages (the compiler rejects missing or extra keys)
    └── model.ts    # MODEL_TEXT: text the UI sends to the model; stays Chinese and is not switched
```

## Rules

- Components read text with `useT()`; non-React code (data client, stores, notices) uses `t()`. Nothing caches a string across a language switch.
- Switching is in place: `setLocale` updates the store, `<html lang>` and the shell's `set_locale` command; no reload. `bootstrapLocale` runs before the first render.
- First launch is English whatever the system language is; only the choice in Settings › Appearance › Language changes it.
- Counts, numbers and dates go through `format.ts` with the catalog's own tag; don't concatenate numbers into sentences or hand-pick plural forms.
- Service errors: the service keeps `error` in Chinese (people reading logs, models reading tool results) and adds a stable `code` and `params`. `errors` in each catalog is keyed by those codes; the list lives in `packages/mastra-service/src/http/error-codes.ts`, and `tests/i18n.test.ts` asserts the list and both catalogs' keys are equal. Unknown codes show the service text.
- Text that reaches a model (prompts, tool descriptions, messages the UI composes for the model) is not UI text: it lives in `model.ts` or the service and is not translated until prompts are.
- `scripts/check-cjk-literals.mjs` (part of `npm run verify`) fails on any CJK string literal, template piece or JSX text in `src/` outside `locales/` (comments are not checked); there is no allowlist, so fixed Chinese that must stay goes in a catalog or `model.ts`.
- The native shell has its own small table (`src-tauri/src/locale.rs`) for what macOS draws: dialog titles and the desktop sprite's window/menu.

## Adding a language

1. Copy `locales/en.ts` to `locales/<id>.ts` as `export const <id>: Messages = { ... }` and translate it; the compiler lists anything missing.
2. Add one entry to `LOCALES` with the id, BCP 47 tag and native name; the Language picker lists it automatically.
3. Add one arm per entry in `src-tauri/src/locale.rs` (`parse` and `text_in`).
4. Extend the key-parity test in `tests/i18n.test.ts` if it names locales explicitly.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
