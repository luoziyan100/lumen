# deployment/
> L2 | 父级: ../CLAUDE.md

- `service-child.ts`：测试进程真实持内核锁并提供认证 HTTP，支持延迟就绪和信号退出。
- `fixture.ts`：只替换 launchctl 调度；实际创建子进程、发现文件和本机健康请求，绝不调用真实 launchctl。
- `lock.test.ts`：独占/稳定 inode/异常退出恢复/旧活锁拒绝以及 discovery 所有权与权限。
- `launchd.test.ts`：安装就绪等待、显式重启、卸载、私有 plist/日志、旧版 plist 原地升级、plist 形状快照(改形状必须登记旧渲染)、凭证不进 plist 且 .env 非私有/软链/硬链即拒绝且不动现有部署，以及未知持有者冲突。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
