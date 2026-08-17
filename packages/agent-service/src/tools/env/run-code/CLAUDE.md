# env/run-code/ — 沙箱执行

> L2 | 父级: `packages/agent-service/src/tools/env/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

`run_code` 与 Seatbelt 一起生死。skill 只读根与域名清单构造注入,不进 ToolContext。
默认无网;`network:true` 时箱内只开 `localhost:<代理端口>`,域名白名单在箱外代理执行(**不验 TLS 内容**,信 client 报的主机名)。

⚠ 调试铁律:**Seatbelt 拒读会伪装成文件不存在**——node 报 `Cannot find module <绝对路径>`、python 报 `can't open file`,而文件明明在盘上。先怀疑 profile 的 read 规则,再怀疑路径(2026-08-02~08 的 26 次失败即此病,修于 `41115a0` seatbelt workspace read)。

## 成员

- `run-code.ts` — `createRunCodeTool({ skillReadRoots, allowedDomains })`;`network` 默认 false;`runCodeTool` 空根单例仅测/占位
- `sandbox.ts` — allow-default + 精准 deny;无代理口时网络规则与改前逐字节一致;有则只放 `localhost:<port>`(Seatbelt 拒写 127.0.0.1)
- `net-allowlist.ts` — `DEFAULT_ALLOWED_DOMAINS` + `hostAllowed`;精确域含子域;空清单=全拒
- `net-proxy.ts` — 每次 run 起 CONNECT/HTTP 代理;拒绝 403 + 记入 llmContent;不解密 TLS
- `index.ts` — 单元出口

法则: 成员完整·一行一文件·父级链接
