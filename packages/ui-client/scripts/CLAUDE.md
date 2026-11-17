# scripts/
> L2 | Parent: ../CLAUDE.md

- `vite-widget-receiver.ts`: the standalone widget document entry, shared by dev and build.
- `check-theme-celadon.mjs`: the static contract check of the existing theme token bridge.
- `check-cjk-literals.mjs`: i18n I5 gate run by `npm run check:i18n` (and root `verify`): a TypeScript AST scan of `src/**/*.{ts,tsx}` string literals, template text and JSX text; any CJK character outside `src/i18n/locales/` fails with file:line. Comments are not scanned.
- `sprite/`: isolated services, browser and native assertions, and the naming audit, for acceptance only. Trace compiles only into debug builds; a release build has no evidence scripts or commands.
- `objects/`: evidence for the isometric objects (the pixel diff against phase 1, the easel's standalone page and its captures). Nothing here ships.

[PROTOCOL]: Update this header on change, then check CLAUDE.md
