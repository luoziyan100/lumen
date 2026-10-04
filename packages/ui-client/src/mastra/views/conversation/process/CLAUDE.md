# process/
> L2 | 父级: ../CLAUDE.md

- `project.ts`：原生parts按用户轮次投影工具卡和思考轨迹，callId去重，不展示redacted reasoning数据，不保存第二消息状态；工具轮公开旁白折进Thought，最终答案落定移除成功过程卡，失败/未完成保留；当前activeTools补齐尚未进入消息的调用；工具中文沿旧VERB，agent-*呈现委派专家与短角色，计时起点只认当前轮用户消息；`createConversationProjection` 复用稳定历史，仅重算当前轮。
- `Rows.tsx`：思考默认折叠/结束收口，工具运行首次展开且尊重用户选择；最近六步窗口和共享CurtainFold呈现（Thought无错峰、Process逐步错峰），不将JSON作为产品正文；工具使用原ThinkingOrb 20px，首token等待使用InlineLoader aperture 32px；等待/思考共用真实起点，恢复0.1秒和分秒格式，无起点或完成态不显示耗时；read_url按原weaving球态。
- `process.css`：复用原thought/proc视觉，只补当前对话间距和错误强调。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
