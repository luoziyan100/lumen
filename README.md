# Lumen

独立研究者的论文研究工具，clean-room 重建。架构：**无头 Node agent 服务 + Tauri 薄客户端**。
设计宪法见 [`doc/agent-core-architecture.md`](doc/agent-core-architecture.md)。

旧实现在同级 `../old_lumen`，作参考与资产来源，不是代码基线。

## 结构

```
packages/
  agent-service/   # 无头 agent 大脑：内核 + 工具 + 存储 + WS 服务（Node）
  ui-client/       # Tauri 薄客户端（UI，连 WS）—— Web 客户端可跑，原生外壳待落地
doc/
  agent-core-architecture.md   # 架构宪法
```

## 不可破不变式

agent = 一条只增不减线程上的循环；**每个 tool_call 的结果必回灌进同一条线程，模型必须看见自己行为的后果**。
sub-agent = runAgent 的递归调用（同一内核两处复用）。验收禁止用注入假循环的测试绕过真实路径。

## 连接服务

agent-service 启动后把 `{port, token, pid}` 写进 `~/.lumen/agent-service.json`（权限 0600）。
**所有 WS 连接必须带 `?token=`**（浏览器对 `ws://127.0.0.1` 没有跨源限制，token 是唯一的门）。
`scripts/ask.ts` 与 `LumenClient` 会自动从 portfile 读；浏览器 dev 用页面 URL `?token=` 传入。

## 跑测试

```bash
cd packages/agent-service && npm install && npm test
```
