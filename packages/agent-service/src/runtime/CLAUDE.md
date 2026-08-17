# runtime/ — 任务运行时

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;resume / 事件语义变更须先过宪法 §4 与 §9.5(交叉矩阵)。

职责:把内核(runAgent/spawn)、存储、工作区、角色拼成**可执行、可订阅、可恢复**的任务运行时。
`agent-runtime.ts` 是编排层;事件/ask/上传/资产/标题/压缩/定根各住卫星。

## 成员

- `agent-runtime.ts` — 生命周期编排:submit/continue/cancel/resume/sweep;skills 人机入口;execute 主干 + compaction 软着陆。再导出 SkillInfo / UploadReceipt / WorkspaceAsset / sanitizeWorkspaceId / defaultSystemPrompt
- `event-hub.ts` — durable 先落库再推送;ephemeral(seq=-1)只 notify;subscribe / emitUser / notifyStatus / task_updated
- `ask-hub.ts` — ask_user 挂起表(taskId+toolCallId);answerUser / cancel 清挂起
- `uploads.ts` — saveUpload 按表示归位(pdf→papers/ 文本→docs/ 图→images/ 其余 uploads/)+ docx 抽 docs/<stem>.md
- `assets.ts` — list/read 资产视图(无 taskId 仅 shared/;有 taskId = shared+session,滤 cache/)
- `title-hub.ts` — 侧栏 title 异步回填;与对话共用 ModelPort,execute 终态 await
- `compaction.ts` — 回合前水位 / 确定性压缩事件 / 终态水位;算法在 storage/context-budget.ts
- `workspace-factory.ts` — 项目根 vs sessions/<tid> 定根;shared/* 走项目根
- `upload-awareness.ts` — UploadRef / formatUploadAnnex / userContentForModel;知情附言纯函数
- `task-title.ts` — 抽摘 user/非空 assistant、清洗短标题、shouldBackfillTitle;`TITLE_PROMPT_MARKER` 标题轮识别标记(测试同源导入)
- `mermaid-repair.ts` — Phase B sidecar:抽围栏 / hash 限次 / 三条禁令 / `runMermaidRepair` 单次无工具 chat,不落库

## 规则

- durable 事件先落库再推送;ephemeral 流式增量是唯一旁路(不占 seq、不入 jsonl)。
- 新特性落地前列交叉矩阵(spawn×resume、cancel×resume、ask_user×cancel、长任务×折叠……),对应测试在 `tests/runtime/` 与 `tests/invariants/`。
