# execution/
> L2 | 父级: ../CLAUDE.md

- `process.test.ts`：真实 macOS Seatbelt 验证 Node/Python 产物、跨任务及软链读写拒绝、超时/取消、输出限额、默认断网与嵌套 Node 代理继承。
- `network.test.ts`：真实本机 HTTP 与 CONNECT 连接验证域名过滤、私网阻断、转发和关闭时隧道销毁。
- `tools.test.ts`：真实 Agent/Controller 默认自动执行沙箱代码，验证失败修正、用户/已绑定来源技能脚本与二进制只读资源、解压产物、显式拒绝及重启默认行为。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
