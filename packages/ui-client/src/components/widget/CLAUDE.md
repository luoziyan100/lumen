# widget/ — 对话网页沙箱

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把模型输出的 ` ```show-widget ` 围栏渲染为沙箱 iframe 内的交互 HTML/SVG/JS。威胁模型与验收见 `briefs/active/web-sandbox-widget.md`。

## 成员

- `sanitize.ts` — 流式剥脚本 / 终态轻清理 / CDN 白名单 / 未闭合 script 截断
- `receiver.ts` — receiver srcdoc(CSP + postMessage 协议 + 青瓷 token 桥)
- `parseShowWidget.ts` — 围栏分段解析与 partial JSON 提取
- `height.ts` — `nextWidgetHeight`:流式 ratchet、终态可收缩
- `WidgetFrame.tsx` — 单 iframe 生命周期、debounce update、finalize;宿主栏宽变化 ping 重测
- `AssistantContent.tsx` — 文本 Markdown(含 mermaid)+ widget 交错;气泡入口

测试:`tests/widget-parse.test.ts`(解析 + sanitize)。

## 安全硬规则

- `sandbox="allow-scripts"`，禁止 `allow-same-origin`
- CSP：`connect-src 'none'`；script 仅 inline + 四家 CDN
- 流式不执行 script；finalize 才执行
