# env/fs/ — 文件系统六件套

> L2 | 父级: `packages/agent-service/src/tools/env/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

「文件系统即上下文」:agent 把正文写成文件,回头 grep / 分段重读。

## 成员

- `index.ts` — ENV_TOOLS:read_file / write_file / edit_file / list_dir / grep / glob。
  `resolveToolPath` 兼容 `file_name`/`filename`;缺 path 必须 error,禁写成字面量 `undefined`。

法则: 成员完整·一行一文件·父级链接
