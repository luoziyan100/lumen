# components/ — UI 组件

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

## 成员

- `Sidebar.tsx` — 左侧栏:收起/搜索(Kumo Tooltip)+ 新对话 + 会话历史列表
- `SearchModal.tsx` — 会话搜索(⌘K):Kumo CommandPalette,内部过滤,↑↓/↵ 键盘导航
- `SettingsModal.tsx` — 设置:外壳 Kumo Dialog(居中/焦点圈/Esc),接口协议 Kumo Select,保存/删除/添加 Kumo Button;模型 profile 两级导航 + 系统提示词;key 只回掩码
- `WorkspaceDrawer.tsx` — 工作区抽屉:「资料 / 产物」分组卡片(Kumo Collapsible),PDF/MD 可点开阅读器
- `ReaderPane.tsx` — 右分屏阅读器:doc 衬线正文 / PDF 二选一
- `PdfViewer.tsx` — pdf.js 竖向连续滚动渲染(锁 4.10.38)
- `ProcessRow.tsx` — 可折叠过程块(Kumo Collapsible):折叠一行摘要,展开逐步
- `Markdown.tsx` — assistant 回复与 .md 文档的渲染:GFM + KaTeX + 代码高亮
- `hljs-celadon.css` — highlight.js 青瓷主题:消费 tokens.css 的 --code-* 语法色板
- `icons.tsx` — 内联 SVG 图标(stroke=currentColor;设计系统:不用 emoji)

## 规则

- 组件只消费 token 与 `styles.css` 既有 class;新视觉模式先进 `doc/ui-design.md` §3 再落地。
- 文案不内联,进 `appCopy.ts` / `settingsCopy.ts`。
- ⚠ styles.css 未分层:同一元素上混用自有 class 与 Kumo 组件时,别写会盖过其 utility 的属性
  (教训:.settings-modal 的 position:relative 曾压掉 Dialog 的 fixed 居中)。
