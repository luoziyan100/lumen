# scroll/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

对话列贴底跟随。钉态外部 store,不重绘消息列。

## 成员

- `useStickToBottom.ts` — 流式贴底;上滑松钉;回滞再钉;高度回缩不追;增高按帧 rAF 跟随(无 140ms 静默窗)
- `scrollMsgAnchor.ts` — 可见消息锚点捕获/恢复;写入 scrollTop 打 restore-msg-anchor
- `scrollDebug.ts` — ⌃⌥⇧S 统一时间轴(事件/身份/过程/Mermaid/滚动);默认关闭;缓冲约 2000 条标量
