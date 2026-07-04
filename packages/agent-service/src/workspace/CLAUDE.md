# workspace/ — 沙箱工作区

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;逃逸防护相关改动必须补对应拒绝用例。

职责:`FsWorkspace` —— agent 攒状态的地面(`~/.lumen/workspaces/<project>/` 下 papers/ notes/ drafts/ scratch/),
以及唯一的路径安全闸门。

## 成员

- `fs-workspace.ts` — FsWorkspace(实现 core 的 Workspace 端口)+ SandboxError + globToRegExp;
  解析真实路径,拒绝 `..` 与符号链接逃逸

## 规则

- 一切文件访问经 Workspace 端口,工具不得自己 fs 直读绝对路径。
- 已知未做:`scoped()` 按 worker 隔离子目录(spawn 隔离),落地时同步宪法 §6 与 tests。
