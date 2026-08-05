# components/ — UI 组件

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

## 成员

- `Sidebar.tsx` — Cursor 式:项目区仅 `p-*`;点 + 才出临时「新建对话」;「最近」平铺;次要点击复制 ID/归档;标题用 MarqueeTitle
- `MarqueeTitle.tsx` — 会话标题溢出悬停跑马灯;≤72 字;探针测宽→`--sb-marquee-shift`;`.is-hot` 开滚;须在 Trigger 的显式 `button.sb-item` 内
- `turnRail.ts` — `buildTurnRailItems`:ChatItem→用户轮次(一问+随后助手答);过程行不占刻度
- `TurnPreviewRail.tsx` — 对话列左侧轮次轨(≥4 轮);空闲极短刻度、悬停鱼眼+预览;窄栏/阅读器开时隐藏;点刻度滚到 `msg-<id>`
- `CreateProjectModal.tsx` — 创建项目悬浮卡(无遮罩):名称 + 可选本机源文件夹(Tauri pick / 粘贴路径)
- `SearchModal.tsx` — 会话搜索(⌘K):Kumo CommandPalette,内部过滤,↑↓/↵ 键盘导航
- `SettingsModal.tsx` — 设置:模型 profiles / 系统提示词 / **后台常驻 LaunchAgent** 开关;外壳 Kumo Dialog
- `UtilityRail.tsx` — 右轨:进度 + 工作目录(共享区 / 本会话,按 Asset.scope);可上传到共享区;左缘拖拽调宽
- `ReaderPane.tsx` — 右分屏阅读器:doc 衬线正文 / PDF / HTML 沙箱
- `PdfViewer.tsx` — pdf.js 竖向连续滚动渲染(锁 4.10.38)
- `HtmlViewer.tsx` — 工作区 HTML 预览:复用 `widget/WidgetFrame`(allow-scripts + CSP,无 same-origin)
- `StatusOrb.tsx` — 行内点云球:thinking-orbs **原生 size=20**(禁 64→CSS 缩,否则九态糊成虚线圈);支持 `paused` 冻帧
- `ProcessRow.tsx` — 可折叠过程块(Kumo Collapsible):左侧 `StatusOrb` 按焦点工具态(`orbStateFromSteps`);完成态 `paused` 仍保留形态差异;与 ThinkingIndicator 的 breathing 分离
- `PlanCard.tsx` — 复杂任务计划卡(`update_plan`→`kind:'plan'`):标题+k/n+步骤;全完成折叠绿勾;与 ProcessRow 职责分离(见 `doc/plan-card.md`)
- `AskUserDialog.tsx` — `ask_user` 输入框上方悬浮问询卡(无遮罩);由 `useAgent.pendingAsk` 驱动(见 `doc/ask-user.md`)
- `ComposerCard.tsx` — 对话输入暗玻璃岛(`border-beam` + @/pills/send);像素试点,见 `doc/ui-design.md` §0
- `CollapsibleUserText.tsx` — 用户超长 prompt 默认折叠(>9 行或 >750 字);底渐隐 + 展开/收起;助手消息不折
- `ThinkingIndicator.tsx` — 模型等待态(尚无过程行/轮间):`StatusOrb` breathing +「思考中」;侧栏 sb-dot 仍脉冲点
- `Markdown.tsx` — .md 文档与纯文本段渲染:GFM + KaTeX + 代码高亮 + ` ```mermaid ` → MermaidBlock
- `MermaidBlock.tsx` — mermaid.js 动态加载;securityLevel=strict;主题读青瓷 token;悬停工具条放大/复制源码;失败回退源码
- `widget/` — 对话网页沙箱(`show-widget` 围栏 → iframe);见 `widget/CLAUDE.md`
- `hljs-celadon.css` — highlight.js 青瓷主题:消费 tokens.css 的 --code-* 语法色板
- `icons.tsx` — **图标唯一入口**:re-export @phosphor-icons/react(Kumo 同源家族)并统一缺省尺寸;组件不得绕过它直接 import phosphor;不用 emoji

## 规则

- 组件只消费 token 与 `styles.css` 既有 class;新视觉模式先进 `doc/ui-design.md` §3 再落地。
- 全窗 Glass 实验(分支 `experiment/glass-ui`):光边只挂输入卡(`border-beam`)与右轨工作区卡(`.glass-beam`);对话列全幅无壳,侧栏/阅读器/弹层不加光边。回退见 `doc/ui-design.md` §0。
- 文案不内联,进 `appCopy.ts` / `settingsCopy.ts`。
- ⚠ styles.css 未分层:同一元素上混用自有 class 与 Kumo 组件时,别写会盖过其 utility 的属性
  (教训:`.glass-beam{position:relative}` 与 `.settings-modal` 的 position 曾压掉 Kumo Dialog 的 `fixed` 居中 → 设置页下移裁切;设置弹窗禁挂 glass-beam)。
