# app/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

App.tsx 的下沉面:布局仍留根文件,连接/空态/对话列/发送草稿按域拆出,避免根组件再过 800 行。

## 成员

- `boot.ts` — SERVICE_URL/TOKEN/IS_DEMO/initialProjectId;默认 127.0.0.1 防 IPv6 假死
- `isEmptyChat.ts` — 无消息且未在跑 = 欢迎空态
- `assetKind.ts` — 无资产表命中时按扩展名推断阅读器 kind
- `EmptyState.tsx` — 封面问候
- `JumpToLatestButton.tsx` — 松钉后「回到最新」;钉态走外部 store
- `ChatTranscript.tsx` — 对话列(Thought/过程/气泡/思考指示);assistant 全阶段 `.msg-group` 根外壳;Sources 原样,宿主表仅漏写兜底
- `useServiceConnection.ts` — 断线重连 + hello.protocolVersion 投影
- `useComposerDraft.ts` — 输入/粘贴图/暂存文件/submit/activateSkill
- `useUnreadSessions.ts` — 未读 id 的 localStorage
- `useThinkClock.ts` — 本轮思考钟;draft→正式 taskId 不断钟
