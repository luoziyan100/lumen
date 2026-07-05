# Briefs

Lumen 的需求/调研 brief。每个 brief 是一份自包含的工作说明，可交给人或另一个 AI 执行。

## 结构

- `active/` — 进行中的 brief。
- `archive/` — 已完成的 brief（实施完成后从 active/ 移入，并更新本 README）。

## 工作流约定

active brief 实施完成后，默认 `mv` 到 `archive/` 并在此 README 标注结果，不必等额外提醒。

## 当前 active

- [projects.md](active/projects.md) — 项目(Projects)功能:多会话共享工作区,独立功能不混入单会话体验(定稿待排期;记忆开关与来源标注解耦另行排期)。
- [run-code-sandbox.md](active/run-code-sandbox.md) — 通用 agent 线的 run_code 工具与本地沙箱方案（定稿待拍板：L1 进程纪律 + L2 Seatbelt，执行环境复用打包 node）。

人格工程工作线（P0–P5）：

- [acting-craft-to-persona.md](active/acting-craft-to-persona.md) — P0 调研需求 brief（表演学→人格提示词方法论）。
- [acting-craft-findings.md](active/acting-craft-findings.md) — P1 调研核验结果（deep-research，15 确认/10 否决，含 caveats 与未决问题）。
- [persona-interview.md](active/persona-interview.md) — P2 人物小传访谈（问题清单）。
- [persona-L0-draft.md](active/persona-L0-draft.md) — P2 产出:owner 原话 + 人格骨架 + 三组张力裁决规则 + 层级原则。
- [persona-prompt-v1.md](active/persona-prompt-v1.md) — P3 产出:完整 L0–L3 系统提示词(剧本)。
- [persona-eval-P4.md](active/persona-eval-P4.md) — P4 回测报告(三方对比):同模型换 prompt 行为翻转(Weak→Good),opus+剧本达 Excellent。**结论:prompt 定方向、模型是杠杆。← 下一步:接进 agent-runtime.ts(并考虑服务切 opus)**
