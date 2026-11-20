# components/ — 独立于 Agent 运行时的阅读与交互组件

> L2 | 父级: ../../CLAUDE.md

新研究工作台直接复用文档、图表与外链呈现；任务状态、输入和设置由 `mastra/` 持有。组件不读取旧协议或旧工作区路径。

```text
components/
├── Markdown.tsx / markdownMath.ts
├── MermaidBlock.tsx / MermaidLightbox.tsx
├── PdfViewer.tsx / HtmlViewer.tsx
├── ExternalLinkDialog.tsx
├── clipboard.ts
├── Tips.tsx
├── icons.tsx / hljs-celadon.css
├── disclosure/             # 原卷帘、详情开合与长文本阅读
└── widget/                 # HTML 隔离沙箱
```

- `Markdown.tsx`：GFM、数学、代码高亮和 Mermaid 的统一渲染器；终稿与流式都接 remark-cjk-friendly（`**` 贴着全角标点、后接汉字时照样加粗，CommonMark 原规则会不加粗或错配）；流式输入暂缓不完整数学，文件链接由调用方处理，禁全局 React 树缓存。
- `markdownMath.ts`：感知围栏与代码片段的数学定界符归一，避免跨代码区配对。
- `MermaidBlock.tsx`：官方 Mermaid/ELK 渲染与箱外测量，颜色随当前外观、换皮肤重画，渲染串行，缓存 LRU 64 条；外层 figure、SVG 层 role=img(按钮与错误对读屏可达)；失败显示源码并可「请模型修正」(会话内普通消息，同会话同图只发一次)。
- `MermaidLightbox.tsx`：流程图放大层的缩放/拖移/Esc 交互。
- `PdfViewer.tsx`：pdf.js 直接读取已认证 Blob 字节，避免桌面 CSP 阻挡二次 blob URL fetch；连续页渲染与受控页码定位只滚 PDF 容器，缩放沿统一图标入口；可选 `fit`（默认关，其他调用方仍从 130% 起）按第 1 页宽度适配容器内宽（页面显示宽度封顶 960px，更宽时居中）、随宽度变化重新适配，手动缩放后停止，工具条「适配宽度」回到适配；没渲染的页尺寸也跟着缩放；被取消的渲染不成为未处理错误；加载失败显示具体原因。
- `HtmlViewer.tsx`：复用 widget iframe 呈现 HTML，保留脚本能力但隔离同源权限。
- `clipboard.ts`：唯一的剪贴板写入 `copyText`；WebKit 无权限时退回点击内的 execCommand，失败抛出可读错误。消息复制与「⋯」菜单的复制 ID 共用。
- `Tips.tsx`：全应用唯一提示层，StudioApp 挂一次。组件照写原生 `title`；指针或键盘焦点（:focus-visible）找到最近带 title 的元素，250ms 后用 Kumo tooltip 的类名与箭头画在元素下方（下方放不下翻到上方，夹在视口内）。显示期间 title 移到 `data-tip`，WKWebView 的灰色原生框不出现；隐藏时还原，React 改 title（复制→已复制）由 MutationObserver 接住。iframe、输入框和 svg 内的 title 不接管。样式在 `styles.css` 的 `.lumen-tip`。
- `ExternalLinkDialog.tsx`：由用户确认外链并保存受信域名，实际打开统一走 openExternalUrl。
- `icons.tsx`：业务图标唯一入口，统一16/18/20尺寸与导航/菜单 ref 合同(兼容 Kumo 的 Phosphor Icon 类型)；视图导航六个图标(解读 book、白板 presentation、沉淀 stack、概念图 conceptMap、灵感 lightbulb、全部 grid，16)；文件按类别使用简洁轮廓，附件不冒充 PDF。
- 图标几何与动效在 `yan-design-system`(icons/glyphs.ts、icons/motion.css)；icons.tsx 只做 React 包装与语义映射。
- `hljs-celadon.css`：消费 token 的代码语法配色。
- `widget/`：show-widget 解析、HTML/脚本处理、CSP iframe 与跨窗消息边界，见自身地图。
- `disclosure/`：侧栏、思考、过程、目录和详情共用原卷帘；关闭保留DOM播放退出，焦点由 inert 隔离。

2026-09-19：旧对话/侧栏/设置组件随 WS 入口退役，领域阅读能力留存。
2026-10-03：清理无生产消费者的旧图标出口，保留单一现役图标边界。
2026-10-06：文件夹、附件、菜单与缩放统一轮廓；同一包装显式固定 regular，消除业务图标的异源与格式文字徽标。
2026-11-11：业务图标从 Phosphor 换为自绘动态纯线条(悬停做物件动作、无色调)；Phosphor 仅作为 Kumo 的 peer 依赖保留。同日几何与动效迁入 yan-design-system。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
