# env/ — L1 环境原语

> L2 | 父级: `packages/agent-service/src/tools/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

作用在沙箱工作区。多文件单元进子目录;单文件单元平铺。

## 成员

- `fs/` — 六件套(read/write/edit/list/grep/glob),一起生死。出口 `index.ts`
- `run-code/` — `run_code` + Seatbelt(`sandbox.ts`) + 箱外白名单代理。改 profile 必跑 `tests/workspace/run-code.test.ts` + `tests/runtime/skills.test.ts`
- `vision/` — `look_at_image` + ImageStore 侧车 + `resolveVision` 档案声明。一起生死
- `todo.ts` — `todo_write`(+ `update_plan` 兼容)
- `memory.ts` — read_memory / write_memory(registry 按项目注入)
- `skills.ts` — `run_skill`(≠ memory) + `install_skill`(工作区包装进 user/project 发现根)
- `subagent.ts` — spawn / get_output / kill / wait
- `ask-user.ts` — `createAskUserTools({ waiter })`;不套 withGuard

法则: 成员完整·一行一文件或一目录·父级链接
