# client/ — 服务的类型化客户端

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:`LumenClient` —— 连接 agent-service 的 WS 客户端,Node 22+ 与浏览器都可用(全局 WebSocket)。
`scripts/ask.ts`、服务端测试与将来第三方集成统一走它,不手写 WS 帧。

## 成员

- `agent-client.ts` — LumenClient:submit/continue/subscribe/cancel/archiveTask/renameTask/pinTask/unpinTask/list/listProjects/createProject/renameProject/archiveProject/listSkills/installSkill/uninstallSkill/activateSkill/repairMermaid/资产 + 事件订阅;自动从 portfile 读端口与 token

## 规则

- 协议类型以 `../protocol/messages.ts` 为准,此处只消费不另定义;list/事件回调用 dto 线上形,不回灌 storage 实现形。
- `packages/ui-client/src/agent-client.ts` 是浏览器侧另一份实现,同样 `import type` 直连 messages;改协议只改真源,两客户端 tsc 会红。
