# widget/ — 对话网页沙箱

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把模型输出的 ` ```show-widget ` 围栏渲染为沙箱 iframe 内的交互 HTML/SVG/JS。威胁模型与验收见 `briefs/archive/web-sandbox-widget.md`。

## 成员

- `sanitize.ts` — 流式剥脚本 / 终态轻清理 / CDN 白名单 / 未闭合 script 截断
- `hoistScripts.ts` — finalize 前把内联 script 登记成 `lumenwidget://` src(WK/Tauri 父 CSP hash 拦动态 textContent/eval)
- `receiver.ts` — receiver HTML 模板(CSP + postMessage + 高度/链接桥);`__widgetSendMessage` 只在岛内最近一次可信 pointerdown/keydown 后 `SEND_WINDOW_MS`(5s)内放行，加载时、定时器和伪造事件发出的一律丢弃;`keydown` 捕获阶段遇 `Escape` 转发 `WIDGET_ESCAPE` 给宿主;`THEME.fillHeight` 切岛内滚动，退出 `fillHeight` 时重置 `_lastH` 并主动重报自然高度;走查仪表 `WIDGET_DIAG`;finalize 吃 CDN + lumenwidget src，按内容与世代幂等，拒绝旧异步脚本回写;lumenwidget: 脚本带 `crossOrigin=anonymous`(scheme 回 ACAO:*)使运行期错误带原文，CORS 加载失败去掉 crossOrigin 重载一次;`WIDGET_PARAMS` 参数单向进页:finalize 带初值，执行脚本前设成只读冻结的 `window.lumenParams`，之后每条消息替换它并派发 `lumen:params`(detail=全部当前值)
- `themeVars.ts` — `collectThemeVars` / `hostChromeIsDark`;暗壳注固定浅档文档色，浅壳镜像深墨与不透明 `surface-*`，内容岛不继承玻璃透明度；receiver 钉 `color-scheme: only light`(防系统暗色自适应抹掉 inline 颜色)
- `../../scripts/vite-widget-receiver.ts` — Vite 插件产出 `/widget-receiver.html`(dev 中间件 + build asset)
- `parseShowWidget.ts` — 围栏分段解析与 partial JSON 提取
- `height.ts` — `nextWidgetHeight`:流式 ratchet、终态可收缩
- `generation.ts` — `widgetGeneration`:终态 html 的内容摘要(FNV-1a + 长度)。终态 html 会原地变的宿主(解读块经 reading_patch 保留 id)拿它做 WidgetFrame 的 key:换代即换新 iframe,同一个 receiver 绝不执行两次脚本;只改参数不换代
- `WidgetFrame.tsx` — 回发消息一律包成 `MODEL_TEXT.widgetSend`(首行 `— 小实验`)，服务端据此不把它算作用户原话(R13);可选 `onEscape` 按 `e.source` 校验后响应 `WIDGET_ESCAPE`;可选 `params`(宿主已按声明校验的值)随 finalize 送入、变化时发 `WIDGET_PARAMS`，从不回读;可选 `onRuntimeError`:finalize 后 `RUNTIME_ERROR_MS`(3s)内首个 error 诊断;iframe.src=`/widget-receiver.html`(禁 srcdoc);finalize 走 hoistInlineScripts;同代同内容只推送一次并携带世代 token;阅读器 `fillHeight`;白板区块 `light` 固定浅档(不随系统暗色变黑);WIDGET_DIAG 常挂 `data-widget-diag`,可见条默认隐藏(走查开 `localStorage lumen:widgetDiag=1`)
- `AssistantContent.tsx` — 文本 Markdown(含 mermaid)+ widget 交错;流式 `deferMath`;气泡入口;终稿把失败图的修正请求经 onSendMessage 发回会话;memo 包一层
- `../HtmlViewer.tsx` — 工作区 HTML 预览入口(`fillHeight`)

测试:`tests/widget-parse.test.ts`(解析 + sanitize + HT-c + hoist + receiver 仪表 + 终态幂等);`tests/widget-theme.test.ts`(暗壳主题对比度 + fillHeight 滚动契约)。

## 换代规则

- WidgetFrame 对同一个 iframe 只 finalize 一次终态代码；终态代码会变的宿主必须用 `widgetGeneration` 做 key 重挂。对话流式是 update → 一次 finalize，不受影响

## 安全硬规则

- `sandbox="allow-scripts"`，禁止 `allow-same-origin`
- CSP 在 **receiver 文档自身**(meta);父页无 `unsafe-inline`/`unsafe-eval`(仅 `'self' lumenwidget:`)
- 小部件不能替用户说话：回发须紧跟用户在岛内的真实操作，且带小实验标记；浏览器证据 `scripts/widget/ui-assert-widget-send.mts`(Chromium + WebKit)
- 流式不执行 script；finalize 才执行。内联由宿主 hoist 成 `lumenwidget:` src(scheme 只吐 invoke 登记过的字节)

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
