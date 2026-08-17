# protocol/ — WS 协议层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;**改任何消息格式,必须同步下方「同步债」两处并跑 ws 契约测试**。

职责:agent-service 与 UI 之间的单 WebSocket 协议:UI 发 submit/continue/subscribe/cancel(整 task)/`cancel_turn`(Stop 默认,本 turn)/`list_subagents`/`kill_subagent`/archive_task/rename_task/pin_task/unpin_task/answer_user/list/list_projects/create_project/rename_project/archive_project/`list_skills`/`install_skill`/`uninstall_skill`/`activate_skill`/`repair_mermaid`/设置类消息,service 推事件流(event/tasks/projects/project_created/project_updated/task_updated/assets/skills/subagents/settings/ok/error)。`repair_mermaid` 是 Phase B sidecar:`ok.source` 为修正 mermaid body,不改 `task_events`(见 `doc/mermaid-pipeline.md` §4.3)。事件流是 task_events 的实时投影;断线靠 subscribe 回放拉齐。`submit`/`continue` 可带 `uploads[]`(上传知情,见 `doc/upload-awareness.md`)。`answer_user` 解开 `ask_user` 挂起(见 `doc/ask-user.md`)。`activate_skill` 与 `run_skill` 同构回灌 playbook 后续跑。`rename_task` / 自动生成均只写侧栏 `title`(≠ goal);`pin_task`/`unpin_task` 写 `pinned_at`;`task_updated` 推侧栏刷新。

## 成员

- `messages.ts` — 协议消息类型(client→server / server→client),协议的唯一真源;`uploads` 与 UploadRef 对齐;hello 带 `protocolVersion`
- `dto.ts` — 线上数据形(不 import storage/runtime 实现),供 messages 与 ui-client tsc 共用
- `version.ts` — `PROTOCOL_VERSION` 运行时常量 + `protocolVersionOf`(缺字段视为 0);hello 与 portfile 同源
- `server.ts` — startServer:把 AgentRuntime 暴露为 localhost WS(带 token 鉴权,4401 踢未授权);`POST /upload` 回 `UploadReceipt` JSON;close 先掐残留 WS 再关 HTTP;连上即推 hello(含 protocolVersion)

## 同步债(已消灭)

ui-client 以 `import type` 直连本目录 `messages.ts`(Vite 擦除,不进 bundle);Node 侧 `client/agent-client.ts` 本就同包直连。不建 `@lumen/shared`(strip-types 不剥 node_modules)。改消息格式 = 改真源 + `tests/service/ws.test.ts` 契约测试过;ui-client `tsc` 会在字段漂移时报错。
