# shell/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

桌面壳能力的薄封装,不进对话状态核。

## 成员

- `pickFolder.ts` — Tauri 选本机文件夹(建项目源路径)
- `useResizable.ts` — 侧栏/右轨拖宽
- `workspaceFile.ts` — 工作区相对路径→`~/.lumen/workspaces/...` 绝对路径(与 Rust `open_workspace_file` 同构);阅读器能否复制源码
