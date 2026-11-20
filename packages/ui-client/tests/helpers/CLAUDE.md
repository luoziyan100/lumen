# helpers/ — 真实 React 组件测试加载

> L2 | 父级: ../CLAUDE.md

- `tsx-loader.mjs`：Node 原生测试按生产模块边界加载 TSX；只处理本地扩展名、TSX 语法与无运行语义的样式，不替换组件或客户端。
- `excalidraw-env.ts`: `loadExcalidraw()` loads the real @excalidraw/excalidraw under the suite's jsdom. It closes two gaps of the host and replaces nothing in the library: extensionless subpath imports inside node_modules (roughjs, points-on-curve) retry with `.js`, and text is measured at a fixed 10px a character, as jsdom has no 2D canvas.
- `canvas-stub.mjs`: a load hook that serves studio/BoardCanvas.tsx as one `.board-canvas` div with the sheet, read-only state, element ids, ops and focus in data attributes, reporting blank like the real canvas; `globalThis.__canvasStubFails` makes it throw. Board, useBoard, the client and the service stay real.
- `zh.ts`: importing it switches the UI to 中文 (no storage write) before the suite renders; re-exports the `zh` catalog and `MODEL_TEXT` so assertions read catalog text, not literals. Import it before any component.

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
