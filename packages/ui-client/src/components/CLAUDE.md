# components/ — 独立于 Agent 运行时的阅读与交互组件

> L2 | 父级: ../../CLAUDE.md

新研究工作台直接复用文档、图表与外链呈现；任务状态、输入和设置由 `mastra/` 持有。组件不读取旧协议或旧工作区路径。

```text
components/
├── Markdown.tsx / markdownMath.ts
├── MermaidBlock.tsx
├── PdfViewer.tsx / HtmlViewer.tsx
├── ExternalLinkDialog.tsx
├── icons.tsx / hljs-celadon.css
├── disclosure/             # 原卷帘、详情开合与长文本阅读
└── widget/                 # HTML 隔离沙箱
```

- `Markdown.tsx`：GFM、数学、代码高亮和 Mermaid 的统一渲染器；流式输入暂缓不完整数学，文件链接由调用方处理，禁全局 React 树缓存。
- `markdownMath.ts`：感知围栏与代码片段的数学定界符归一，避免跨代码区配对。
- `MermaidBlock.tsx`：官方 Mermaid/ELK 渲染与箱外测量，失败显示源码，放大层独立缩放。
- `PdfViewer.tsx`：pdf.js 直接读取已认证 Blob 字节，避免桌面 CSP 阻挡二次 blob URL fetch；连续页渲染与受控页码定位只滚 PDF 容器，不滚工作台祖先；加载失败显示具体原因。
- `HtmlViewer.tsx`：复用 widget iframe 呈现 HTML，保留脚本能力但隔离同源权限。
- `ExternalLinkDialog.tsx`：由用户确认外链并保存受信域名，实际打开统一走 openExternalUrl。
- `icons.tsx`：Phosphor 图标统一出口与默认尺寸，保留当前导航、文件、技能、过程和外链图标；退役的旧侧栏别名与未消费 glyph 不再导出。
- `hljs-celadon.css`：消费 token 的代码语法配色。
- `widget/`：show-widget 解析、HTML/脚本处理、CSP iframe 与跨窗消息边界，见自身地图。
- `disclosure/`：侧栏、思考、过程、目录和详情共用原卷帘；关闭保留DOM播放退出，焦点由 inert 隔离。

2026-09-19：旧对话/侧栏/设置组件随 WS 入口退役，领域阅读能力留存。
2026-10-03：清理无生产消费者的旧图标出口，保留单一现役图标边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
