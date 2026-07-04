# client/ — 服务的类型化客户端

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:`LumenClient` —— 连接 agent-service 的 WS 客户端,Node 22+ 与浏览器都可用(全局 WebSocket)。
`scripts/ask.ts`、服务端测试与将来第三方集成统一走它,不手写 WS 帧。

## 成员

- `agent-client.ts` — LumenClient:submit/continue/subscribe/cancel/list + 事件订阅;自动从 portfile 读端口与 token

## 规则

- 协议类型以 `../protocol/messages.ts` 为准,此处只消费不另定义。
- 注意:`packages/ui-client/src/agent-client.ts` 是浏览器侧的另一份实现(历史原因,待 @lumen/shared 合流)——改协议时三处对齐:protocol/messages、本目录、ui-client。
