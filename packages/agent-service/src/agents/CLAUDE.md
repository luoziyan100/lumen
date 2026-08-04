# agents/ — 人格与角色

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;人格剧本的实质修改必须走 briefs 回测流程(见下)。

职责:定义「Lumen 是谁」与「worker 是什么角色」。

## 成员

- `persona.ts` — LUMEN_PERSONA:人格剧本(L0–L3)+ 工具/可视化/计划/问用户能力段。人格源自 briefs 工程线
  (P0→P4);可视化合同:结构图→`mermaid`,交互→`show-widget`;复杂任务→`update_plan`(见 `doc/plan-card.md`);
  歧义决策→`ask_user`(见 `doc/ask-user.md`)。
- `roles.ts` — WORKER_ROLE_SPECS / buildRoles:worker 角色定义与受限工具装配(spawn 用);`ask_user` 不进 worker。

## 规则

- 改人格(L0–L3)不许直接拍:提案落 brief → 按 P4 的三方回测法(同模型换 prompt 对比)出报告 → 过了再改 `persona.ts`,并在文件头记版本与依据。
- 能力合同段(工具用法 / show-widget / update_plan / ask_user 格式)可随对应 brief 追加,不强制走人格回测。
- 角色的工具子集只能收窄,不能越过 `tools/` 的安全边界(fs 沙箱、网络白名单)。
