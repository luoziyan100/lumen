# widget/ — 对话网页沙箱

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把模型输出的 ` ```show-widget ` 围栏渲染为沙箱 iframe 内的交互 HTML/SVG/JS。威胁模型与验收见 `briefs/archive/web-sandbox-widget.md`。

## 成员

- `sanitize.ts` — 流式剥脚本 / 终态轻清理 / CDN 白名单 / 未闭合 script 截断
- `hoistScripts.ts` — finalize 前把内联 script 登记成 `lumenwidget://` src(WK/Tauri 父 CSP hash 拦动态 textContent/eval)
- `receiver.ts` — receiver HTML 模板(CSP + postMessage + 高度/链接桥);`THEME.fillHeight` 切岛内滚动;走查仪表 `WIDGET_DIAG`;finalize 吃 CDN + lumenwidget src
- `themeVars.ts` — `collectThemeVars` / `hostChromeIsDark`;暗壳注浅档文档色;receiver 钉 `color-scheme: only light`(防系统暗色自适应抹掉 inline 颜色)
- `../../scripts/vite-widget-receiver.ts` — Vite 插件产出 `/widget-receiver.html`(dev 中间件 + build asset)
- `parseShowWidget.ts` — 围栏分段解析与 partial JSON 提取
- `height.ts` — `nextWidgetHeight`:流式 ratchet、终态可收缩
- `WidgetFrame.tsx` — iframe.src=`/widget-receiver.html`(禁 srcdoc);finalize 走 hoistInlineScripts;阅读器 `fillHeight`;WIDGET_DIAG 常挂 `data-widget-diag`,可见条默认隐藏(走查开 `localStorage lumen:widgetDiag=1`)
- `AssistantContent.tsx` — 文本 Markdown(含 mermaid)+ widget 交错;流式 `deferMath`;气泡入口;终稿可带 mermaid Phase B 修复
- `../HtmlViewer.tsx` — 工作区 HTML 预览入口(`fillHeight`)

测试:`tests/widget-parse.test.ts`(解析 + sanitize + HT-c + hoist + receiver 仪表);`tests/widget-theme.test.ts`(暗壳主题对比度 + fillHeight 滚动契约)。

## 安全硬规则

- `sandbox="allow-scripts"`，禁止 `allow-same-origin`
- CSP 在 **receiver 文档自身**(meta);父页无 `unsafe-inline`/`unsafe-eval`(仅 `'self' lumenwidget:`)
- 流式不执行 script；finalize 才执行。内联由宿主 hoist 成 `lumenwidget:` src(scheme 只吐 invoke 登记过的字节)
