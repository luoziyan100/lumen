# helpers/ — 真实 React 组件测试加载

> L2 | 父级: ../CLAUDE.md

- `tsx-loader.mjs`：Node 原生测试按生产模块边界加载 TSX；只处理本地扩展名、TSX 语法与无运行语义的样式，不替换组件或客户端。
- `zh.ts`: importing it switches the UI to 中文 (no storage write) before the suite renders; re-exports the `zh` catalog and `MODEL_TEXT` so assertions read catalog text, not literals. Import it before any component.

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
