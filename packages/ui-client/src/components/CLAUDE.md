# components/ — UI 组件

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

## 成员

- `Sidebar.tsx` — Cursor 式:项目区仅 `p-*`(悬停文件夹→chevron);点 + 才出临时「新建对话」(未发言离开即消);空项目不写「还没有会话」;「最近」平铺历史
- `CreateProjectModal.tsx` — 创建项目弹框:名称 + 可选本机源文件夹(Tauri pick / 粘贴路径)
- `SearchModal.tsx` — 会话搜索(⌘K):Kumo CommandPalette,内部过滤,↑↓/↵ 键盘导航
- `SettingsModal.tsx` — 设置:外壳 Kumo Dialog(居中/焦点圈/Esc),接口协议 Kumo Select,保存/删除/添加 Kumo Button;模型 profile 两级导航 + 系统提示词;key 只回掩码
- `UtilityRail.tsx` — 右轨:进度 + 工作目录(共享区 / 本会话,按 Asset.scope);可上传到共享区;左缘拖拽调宽
- `ReaderPane.tsx` — 右分屏阅读器:doc 衬线正文 / PDF / HTML 沙箱
- `PdfViewer.tsx` — pdf.js 竖向连续滚动渲染(锁 4.10.38)
- `HtmlViewer.tsx` — 工作区 HTML 预览:复用 `widget/WidgetFrame`(allow-scripts + CSP,无 same-origin)
- `ProcessRow.tsx` — 可折叠过程块(Kumo Collapsible):折叠一行摘要,展开逐步
- `Markdown.tsx` — .md 文档与纯文本段渲染:GFM + KaTeX + 代码高亮 + ` ```mermaid ` → MermaidBlock
- `MermaidBlock.tsx` — mermaid.js 动态加载;securityLevel=strict;主题读青瓷 token;悬停工具条放大/复制源码;失败回退源码
- `widget/` — 对话网页沙箱(`show-widget` 围栏 → iframe);见 `widget/CLAUDE.md`
- `hljs-celadon.css` — highlight.js 青瓷主题:消费 tokens.css 的 --code-* 语法色板
- `icons.tsx` — **图标唯一入口**:re-export @phosphor-icons/react(Kumo 同源家族)并统一缺省尺寸;组件不得绕过它直接 import phosphor;不用 emoji

## 规则

- 组件只消费 token 与 `styles.css` 既有 class;新视觉模式先进 `doc/ui-design.md` §3 再落地。
- 文案不内联,进 `appCopy.ts` / `settingsCopy.ts`。
- ⚠ styles.css 未分层:同一元素上混用自有 class 与 Kumo 组件时,别写会盖过其 utility 的属性
  (教训:.settings-modal 的 position:relative 曾压掉 Dialog 的 fixed 居中)。
