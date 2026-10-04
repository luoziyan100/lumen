# mastra-service — Mastra 应用服务
> L2 | 父级: ../../CLAUDE.md

唯一现役应用服务。消息、执行与恢复使用 Mastra，项目/研究算法/文件权限属于 Lumen；禁止打开旧 ~/.lumen。

- `package.json`：精确锁定 Mastra/模型 SDK/unpdf 依赖与独立启动、验证命令。
- `tsconfig.json`：新服务与行为用例的严格类型检查。
- `src/`：新应用组合与产品扩展；不依赖旧 core/runtime。
- `scripts/`：隔离临时数据根的真实模型机制验证。
- `tests/`：经过真实 Mastra/LibSQL 的行为验证，仅模型网络边界可替换。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md


开发启动：`npm run start -w @lumen/mastra-service -- --data-root /绝对路径/隔离目录 [--settings /绝对路径/旧settings.json]`。可选 settings 仅在新根未初始化时显式导入，并以0600保存在新根；未配置模型也可打开界面填写。仅监听 127.0.0.1，发现文件位于隔离目录的 `mastra-service.json`；不打印 token/模型 key，进程本身不安装 launchd。启动持有稳定 inode 的内核独占锁，崩溃后内核自动释放；遗留运行不自动重放。显式 launchd 安装见 scripts/CLAUDE.md，默认 com.lumen.mastra，预览须显式独立 label。研究凭证可从 `OPENALEX_API_KEY` / `TAVILY_API_KEY` 环境注入。

浏览器联调：启动服务时显式传 `LUMEN_DEV_ORIGIN=http://localhost:5180`，启动 Vite 时传 `LUMEN_MASTRA_HOME=/绝对路径/隔离目录`；只向该本机来源开放 CORS。独占入口在接受请求前结算上个进程的 pending/running 子任务，不重放执行。
