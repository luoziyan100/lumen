# components/ — UI 组件

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

## 成员

- `Sidebar.tsx` — Cursor 式:可折「项目」整区(标题 chevron + `lumen:sbProjectsOpen`) → 全局「置顶」→「最近」;项目行 chevron 折单树并记 `lumen:sbExpandedProjects`;折叠动效走 `CurtainFold`;项目树/最近走 `visibleSessions`(4/20)+ active 保底,溢出「查看全部」换面会话页;会话行左灯(`sessionLamp`:idle 空心/unread 实心/running 脉动,点圆 toggle 未读);双指点按置顶/重命名/复制/归档;钉会话不重复出现在树/最近;行内重命名写 `title`;`protocolMismatch` 复用离线横幅位显示重启提示
- `SessionsView.tsx` — 会话页:全量 list 上搜索∩筛选+分页;主列替换对话,侧栏留着
- `CurtainFold.tsx` — **Curtain Language 原语**:grid Accordion + 卷帘 clip + spring 展开/curtain 收起;`stagger` 子项 cascade;关合保持挂载+`inert`;Accordion 式开合默认用它(过程块/侧栏/右轨目录/用户长文),禁再引入第二套高度动画
- `MarqueeTitle.tsx` — 溢出单向走马灯:双份文案 + track `translateX(-50%)`;热态由 Sidebar `hoveredTaskId`(同时最多一条)+菜单打开注入,组件不自管 pointer(Trigger 内 leave 会粘行)
- `turnRail.ts` — `buildTurnRailItems`:ChatItem→用户轮次(一问+随后助手答);过程行不占刻度
- `TurnPreviewRail.tsx` — 对话列左侧轮次轨(≥4 轮);空闲小圆点、悬停鱼眼放大+预览;窄栏/阅读器开时隐藏;点圆点滚到 `msg-<id>`;可见轮 IO 在本组件(不抬 App)
- `CreateProjectModal.tsx` — 创建项目悬浮卡(无遮罩):名称 + 可选本机源文件夹(Tauri pick / 粘贴路径)
- `SearchModal.tsx` — 会话搜索(⌘K):Kumo CommandPalette;`sessionMatchesQuery` 过滤,↑↓/↵ 键盘导航
- `SettingsModal.tsx` — 设置:供应商接入目录(卡内多模型 ID;列表自滚动;悬停启用/删除)/系统提示词/LaunchAgent;选用权在 composer 芯片
- `UtilityRail.tsx` — 右轨:Todo Progress 优先(无 Todo 回退 process);工作目录(共享区/本会话,`CurtainFold` 开合);左缘拖拽调宽(默认 300,`lumen:railWidth.v4`)
- `ReaderPane.tsx` — 右分屏阅读器:doc 衬线正文 / PDF / HTML 沙箱
- `PdfViewer.tsx` — pdf.js 竖向连续滚动渲染(锁 4.10.38)
- `HtmlViewer.tsx` — 工作区 HTML 预览:复用 `widget/WidgetFrame`(allow-scripts + CSP,无 same-origin)
- `StatusOrb.tsx` — 行内点云球:thinking-orbs **原生 size=20**(禁 64→CSS 缩,否则九态糊成虚线圈);支持 `paused` 冻帧
- `ProcessRow.tsx` — 可折叠过程块(`CurtainFold` + 步骤 cascade);长轨迹只露最近 6 步;运行中 shimmer + 等宽计时;左侧 `StatusOrb` 按焦点工具态(`orbStateFromSteps`);与 ThinkingIndicator 的 breathing 分离
- `ThoughtRow.tsx` — 同 turn 一条思考轨迹;运行中 shimmer「思考中」+ live 计时;收口只留 Thought process 摘要(不报秒)
- `SourceList.tsx` — 模型漏写 Sources 时的答末兜底表;按站点一行(`collapseSourcesBySite`);超 8 **站** +N more / Show less;点开走 ExternalLinkGate。挑选权在模型正文
- `ExternalLinkDialog.tsx` — Claude 式外链确认 + 按域名记住
- `ThinkingIndicator.tsx` — 首 token 前等待:光圈 + shimmer + live 计时;有开放 Thought 时不叠
- `TodoCard.tsx` — 会话 Todo 次要卡(`todo_write`→`kind:'todo'`);主呈现右轨 Progress(见 `doc/todo.md`)
- `AskUserDialog.tsx` — `ask_user` 悬浮问询卡;多题 Claude 式一页一题 + `i of n` 切换;「其他」幽灵输入;见 `doc/ask-user.md`
- `ComposerCard.tsx` — 对话输入暗玻璃岛;`+` Skills;/ 斜杠;模型芯片;拖放;液态抛光;待发图放大(无灰幕,点空白/X/Esc 关);当前稿 chip(activePath);见 `doc/ui-design.md` §0
- `SkillSlashMenu.tsx` — `/` 过滤 Skills + Manage 入口;行左 `SkillIcon`,Manage 用公文包
- `ManageSkillsDialog.tsx` — Manage skills:列表/添加文件夹·SKILL.md/卸载(Kumo Dialog,禁 glass-beam);行左 `SkillIcon`
- `CollapsibleUserText.tsx` — 用户超长 prompt 默认折叠(>9 行或 >750 字);预览 clamp + `CurtainFold` 揭开全文;助手消息不折
- `MsgFileChips.tsx` — 用户气泡附件 chip(上传知情 S4);点开读阅读器;见 `doc/upload-awareness.md`
- `Markdown.tsx` — .md 文档与纯文本段渲染:GFM + KaTeX + 代码高亮 + ` ```mermaid ` → MermaidBlock;流式 `deferMath` 暂缓 KaTeX/mermaid 防高度抖
- `MermaidBlock.tsx` — mermaid.js 动态加载;flowchart 优先官方 ELK(失败回 dagre);SVG 固有宽+max-width(禁 100% 拉伸);卡片右上角放大+复制;放大层 ± / 双指缩放;失败回退源码+「尝试修复」(Phase B,不改落库);见 `doc/mermaid-readability.md`
- `widget/` — 对话网页沙箱(`show-widget` 围栏 → iframe);见 `widget/CLAUDE.md`
- `hljs-celadon.css` — highlight.js 青瓷主题:消费 tokens.css 的 --code-* 语法色板
- `icons.tsx` — **图标唯一入口**:re-export @phosphor-icons/react(Kumo 同源家族)并统一缺省尺寸;组件不得绕过它直接 import phosphor;不用 emoji;`FolderIcon` 接受 `open` → FolderSimple/FolderOpen;`ChevronIcon`(树左 CaretRight)/`SectionChevronIcon`(区右 CaretDown);Skills:`skillGlyphForName`/`SkillIcon`/`ManageSkillsIcon`(Briefcase,非齿轮)

## 规则

- 组件只消费 token 与 `styles.css` 既有 class;新视觉模式先进 `doc/ui-design.md` §3 再落地。
- **Curtain Language**:Accordion 式内容开合(侧栏树、过程块、右轨目录、用户长文)统一走 `CurtainFold`;收=curtain 上卷、开=spring 揭帘(+可选 stagger)。浮层(Dropdown/⌘K/斜杠)与左右整栏显隐不套卷帘。
- 全窗 Glass 实验(分支 `experiment/glass-ui`):光边只挂输入卡(`border-beam`)与右轨工作区卡(`.glass-beam`);`.glass-card` 给侧栏双指菜单与设置模型卡(毛玻璃+反射高光);对话列全幅无壳;设置 Dialog **根**禁挂 glass-beam/glass-card(会毁 fixed 居中)。回退见 `doc/ui-design.md` §0。
- 文案不内联,进 `appCopy.ts` / `settingsCopy.ts`。
- ⚠ styles.css 未分层:同一元素上混用自有 class 与 Kumo 组件时,别写会盖过其 utility 的属性
  (教训:`.glass-beam{position:relative}` 与 `.settings-modal` 的 position 曾压掉 Kumo Dialog 的 `fixed` 居中 → 设置页下移裁切;设置弹窗禁挂 glass-beam)。
