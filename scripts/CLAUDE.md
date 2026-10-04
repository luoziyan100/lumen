# scripts/

> L2 | 父级: /CLAUDE.md
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

开发进程组合与历史测试索引。旧矩阵 checker 仅用于旧架构历史核查，已退出当前 verify。

## 成员

- `dev.mjs` — 共用独立开发数据根启动 Mastra 与 Vite，退出成对停止，Node 24 为最低运行版本。

- `check-testing-matrix.mjs` — 测试体系双向校验：export `runCheck`；manifest → 矩阵/源码；矩阵每个 `test_id` → 绑定条目或 historical-unbound；重复 ID、skip-as-pass、covered 无实体、evidence 路径、partial/uncovered 须写原因
- `check-testing-matrix.test.mjs` — checker 负向夹具：缺文件、重复 ID、矩阵悬空、skip 标 covered、状态不一致必须失败
- `build-testing-historical-index.mjs` — 从矩阵生成 `doc/testing-historical-ids.json`：历史 unbound ID → 现存测试文件 + commit 或 evidence 文档 + sha256

法则: 成员完整·一行一文件·父级链接·技术词前置
