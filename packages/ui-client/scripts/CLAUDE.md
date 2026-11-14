# scripts/
> L2 | 父级: ../CLAUDE.md

- `vite-widget-receiver.ts`：开发与构建共用的独立 widget 文档入口。
- `check-theme-celadon.mjs`：既有主题 token 桥的静态合同检查。
- `check-cjk-literals.mjs`: i18n I5 gate run by `npm run check:i18n` (and root `verify`): a TypeScript AST scan of `src/**/*.{ts,tsx}` string literals, template text and JSX text; any CJK character outside `src/i18n/locales/` fails with file:line. Comments are not scanned.
- `sprite/`：一体两形的隔离服务、浏览器/原生断言与命名审计；只用于验收；trace 仅调试构建条件编译，正式构建不含取证脚本或命令。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
