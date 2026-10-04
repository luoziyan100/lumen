# execution/
> L2 | 父级: ../CLAUDE.md

模型代码默认在当前任务沙箱自动执行；取消与工具结果由 Mastra 持有，显式配置的 ask/deny 仍由 Controller 执行，本模块只提供受限子进程能力。

```text
execution/
├── tools.ts
├── process.ts
├── sandbox.ts
├── network.ts
└── domains.ts
```

- `tools.ts`：无需逐次审批的 run_code；调用方按受信任务解析技能只读根，输入不能选择宿主目录，失败进入框架工具错误。
- `process.ts`：Node/Python 生命周期；保留原 Homebrew/POSIX 命令发现与子 Node 代理继承，任务内脚本/日志、进程组超时/取消及输出限额。
- `sandbox.ts`：macOS Seatbelt 文件与网络边界；系统运行库和显式根只读，只有当前任务可写，其他平台拒绝执行。
- `network.ts`：每次执行独立的 HTTP/CONNECT 代理；域名白名单及公网 DNS 地址检查，关闭时销毁连接。
- `domains.ts`：研究网络默认域名与纯域名匹配；由组合根明确选择传入，不自动开启网络。

决策：沿用已有 Seatbelt 与箱外代理机制，收紧为任务目录隔离；不再开放全局临时目录或其他任务读取。取消等待进程退出，防止 UI 已停止但代码仍写文件。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
