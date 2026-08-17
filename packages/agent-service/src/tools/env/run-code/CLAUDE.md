# env/run-code/ — 沙箱执行

> L2 | 父级: `packages/agent-service/src/tools/env/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

`run_code` 与 Seatbelt 一起生死。skill 只读根构造注入,不进 ToolContext。

## 成员

- `run-code.ts` — `createRunCodeTool({ skillReadRoots })`;`runCodeTool` 空根单例仅测/占位
- `sandbox.ts` — allow-default + 精准 deny(网络全禁/写限工作区);读禁 ~/.ssh 与 token 文件
- `index.ts` — 单元出口

法则: 成员完整·一行一文件·父级链接
