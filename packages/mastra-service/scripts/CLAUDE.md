# scripts/
> L2 | 父级: ../CLAUDE.md

- `live-probe.ts`：只读取指定旧模型档案，在临时数据根执行真实模型文件任务；不迁移正式会话或输出凭证。
- `import-legacy.ts`：显式 `--source-root` 与 `--target-root` 的离线历史导入；默认 dry-run，仅 `--apply` 发布已验证新数据根；重复 `--copy-source PROJECT_ID=PATH` 或 `--bind-source PROJECT_ID=PATH` 明确旧 source_path 的处理方式，未映射则阻止发布。
- `launchd-cli.ts`：显式 Node 24/工程/数据根的 install/status/uninstall；默认 `com.lumen.mastra`，预览用显式 `--label com.lumen.mastra.preview`，`install --restart` 重启同配置 job。

本机部署：`node --experimental-strip-types packages/mastra-service/scripts/launchd-cli.ts install --node /绝对路径/node --project-root /绝对路径/lumen --data-root /绝对路径/新根`。Node 可通过 `node -p process.execPath` 确认；安装时验证主版本 24，并在 plist 中固定真实路径。默认新正式 label `com.lumen.mastra`；隔离验证须显式 `--label com.lumen.mastra.preview`，从不复用旧 label。`status` / `uninstall` 需要同样路径参数；卸载只删除匹配的 plist，保留数据与日志。

plist 及发现文件以 0600 原子发布，日志目录 0700、日志文件 0600。安装等待 job PID、discovery PID 和 Bearer 健康响应一致才报告 ready。已有健康服务默认幂等；部署代码更新后加 `--restart`。同 label 不同配置、未知活进程、损坏或不安全元数据均拒绝接管，错误不打印 token。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
