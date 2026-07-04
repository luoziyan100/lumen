# components/ — UI 组件

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

## 成员

- `Sidebar.tsx` — 左侧栏:收起/搜索 + 新对话 + 会话历史列表
- `SearchModal.tsx` — 会话搜索弹窗(⌘K):实时过滤,Enter 选第一条
- `SettingsModal.tsx` — 设置:模型 profile 两级导航(卡片列表→编辑表单)+ 系统提示词;key 只回掩码;首批 Kumo Button(保存/删除/添加)在此落地
- `WorkspaceDrawer.tsx` — 工作区抽屉:「资料 / 产物」分组卡片,PDF/MD 可点开阅读器
- `ReaderPane.tsx` — 右分屏阅读器:doc 衬线正文 / PDF 二选一
- `PdfViewer.tsx` — pdf.js 竖向连续滚动渲染(锁 4.10.38)
- `ProcessRow.tsx` — 可折叠过程块:折叠一行摘要,展开逐步
- `Markdown.tsx` — assistant 回复与 .md 文档的渲染:GFM + KaTeX + 代码高亮
- `icons.tsx` — 内联 SVG 图标(stroke=currentColor;设计系统:不用 emoji)

## 规则

- 组件只消费 token 与 `styles.css` 既有 class;新视觉模式先进 `doc/ui-design.md` §3 再落地。
- 文案不内联,进 `appCopy.ts` / `settingsCopy.ts`。
