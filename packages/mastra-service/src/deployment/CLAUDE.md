# deployment/
> L2 | 父级: ../CLAUDE.md

- `types.ts`：显式本机部署配置与命令执行边界；公开状态不携带 discovery token。
- `config.ts`：规范化 Node 24、工程及数据根绝对路径，生成默认 com.lumen.mastra 或显式隔离 label 的 launchd plist；研究 key 经 `--env-file-if-exists=<数据根>/.env` 读取，plist 不含凭证；`renderPreviousPlists` 是本部署历史 plist 白名单——**改 renderPlist 任何输出都必须把改动前的渲染追加进去**，否则已装机器会被判冲突而拒绝升级(形状快照测试强制)。
- `files.ts`：私有目录/文件校验与同目录原子发布，拒绝符号链接和共享 inode；`assertPrivateIfPresent` 只 lstat 校验交给外部读取的私有文件(如 Node 读的 .env)。
- `lock.ts`：稳定 inode 的 Darwin 内核独占锁；释放不删除文件，崩溃由内核释放。
- `discovery.ts`：仅持锁实例可发布/清理私有发现文件，读取时验证本机地址与身份。
- `launchd.ts`：显式 job 的安装、状态与卸载；健康必须同时匹配 job PID、发现 PID 和认证响应。已装 plist 是本部署旧版时状态带 `outdated`，install 原地升级；其他不一致仍为冲突。install 在停旧服务前校验 `<数据根>/.env`：缺失放行，存在须为本人 0600 普通文件(非软链/硬链)，否则报错且不动现有部署。

依赖方向：CLI → 配置/launchd → 私有文件和系统命令；start → lock/discovery。新服务不导入旧 service/core，不接管旧数据根，部署始终要求显式 Node/工程/数据根。
启动锁文件 `mastra-service.owner` 永不 unlink；旧 `mastra-service.lock` 仅只读检查，活 PID 或损坏格式拒绝接管。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
