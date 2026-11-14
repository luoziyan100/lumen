# agents/
> L2 | 父级: ../CLAUDE.md

- `Agents.tsx`：`AgentsPane`，设置里的「专家」分页（不再是独立对话框）——全局专家快照、来源与能力展示，全局启停和空闲重载；配置错误可见，运行中写入由服务拒绝；写入中经 `onBusy` 让设置页锁住分类与关闭；专家卡用自己的 `agents.css`（头部名称与 outline 启停按钮同一行，卡面与模型卡同为 glass-card），不再借 `.mw-question`/`.mw-dialog` 的样式；工具与指令使用共享Disclosure，关合保留内容并摘除焦点。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
