# widget/ — 对话网页沙箱

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把模型输出的 ` ```show-widget ` 围栏渲染为沙箱 iframe 内的交互 HTML/SVG/JS。威胁模型与验收见 `briefs/active/web-sandbox-widget.md`。

## 成员

- `sanitize.ts` — 流式剥脚本 / 终态轻清理 / CDN 白名单 / 未闭合 script 截断
- `receiver.ts` — receiver HTML 模板(CSP + postMessage + 高度/链接桥)
- `themeVars.ts` — `collectThemeVars` / `hostChromeIsDark`;暗壳注浅档文档色;receiver 钉 `color-scheme: only light`(防系统暗色自适应抹掉 inline 颜色)
- `../../scripts/vite-widget-receiver.ts` — Vite 插件产出 `/widget-receiver.html`(dev 中间件 + build asset)
- `parseShowWidget.ts` — 围栏分段解析与 partial JSON 提取
- `height.ts` — `nextWidgetHeight`:流式 ratchet、终态可收缩
- `WidgetFrame.tsx` — iframe.src=`/widget-receiver.html`(禁 srcdoc:父 CSP 会继承掐死 bootstrap);debounce update / finalize
- `AssistantContent.tsx` — 文本 Markdown(含 mermaid)+ widget 交错;气泡入口

测试:`tests/widget-parse.test.ts`(解析 + sanitize);`tests/widget-theme.test.ts`(暗壳主题对比度)。

## 安全硬规则

- `sandbox="allow-scripts"`，禁止 `allow-same-origin`
- CSP 在 **receiver 文档自身**(meta);父页 `script-src 'self'` 保持不放宽
- 流式不执行 script；finalize 才执行
