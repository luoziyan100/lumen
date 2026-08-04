# 问用户（Ask user question）

状态: **现行**（2026-08-04）

## 问题

研究任务常有歧义或不可逆选择（范围/来源/写法）。若模型自行拍板，用户事后才发现偏航；若打断成普通聊天 `continue`，又与「任务仍在 running」冲突。

## 决策

1. **一等工具 `ask_user`**：模型产出 1–3 道结构化选择题；`tool.run` **挂起**当前 turn，直到用户作答。
2. **答案 = `tool_result.llmContent`**：回灌同一条只增线程（铁律）；不用 `continue` 解阻塞。
3. **WS `answer_user`**：UI 经专用消息把选项/跳过交给 runtime，解开 pending Promise。
4. **UI 输入框上方悬浮卡**：贴 composer 上方，无遮罩、不居中霸屏；见 `tool_call(ask_user)` 打开，见配对 `tool_result` 关闭。
5. **主 agent 默认可用**：无 Plan/Default feature gate；**不**注册给 worker；**不**套 `withGuard` 150s（人思考时间不可当挂起）。
6. **一直阻塞**：无超时空答；跳过/取消写入明确文案，避免模型误读空答案。

## 非目标（v1）

- 自动超时交空答案、secret 输入、worker 内提问、对话流常驻 QuestionCard、用户改历史答案。

## 实现锚点

- 工具：`packages/agent-service/src/tools/env/ask-user-tools.ts`
- Runtime pending：`packages/agent-service/src/runtime/agent-runtime.ts`
- 协议：`answer_user` in `protocol/messages.ts` + 双端 `agent-client.ts`
- Persona：`packages/agent-service/src/agents/persona.ts`
- UI：`packages/ui-client/src/components/AskUserDialog.tsx` + `useAgent` 的 `pendingAsk`
