# protocol/ — WS 协议层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;**改任何消息格式,必须同步下方「同步债」两处并跑 ws 契约测试**。

职责:agent-service 与 UI 之间的单 WebSocket 协议:UI 发 submit/continue/subscribe/cancel/list/设置类消息,service 推事件流(event/tasks/assets/settings/ok/error)。事件流是 task_events 的实时投影;断线靠 subscribe 回放拉齐。

## 成员

- `messages.ts` — 协议消息类型(client→server / server→client),协议的唯一真源
- `server.ts` — startServer:把 AgentRuntime 暴露为 localhost WS(带 token 鉴权,4401 踢未授权)

## ⚠ 同步债(已知,计划以 @lumen/shared 消灭)

协议类型目前有**三份消费点**:本目录(真源)、`../client/agent-client.ts`、`packages/ui-client/src/agent-client.ts`(浏览器侧手工内联)。
在 shared 包建立之前:改消息格式 = 三处一起改 + `tests/service/ws.test.ts` 契约测试过。这是全仓最容易漂移的地方。
