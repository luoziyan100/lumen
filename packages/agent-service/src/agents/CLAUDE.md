# agents/ — 人格与角色

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;人格剧本的实质修改必须走 briefs 回测流程(见下)。

职责:定义「Lumen 是谁」与「worker 是什么角色」。

## 成员

- `persona.ts` — LUMEN_PERSONA:Lumen 的人格系统提示词(剧本)。源自 briefs 人格工程线
  (P0 调研 → P4 回测,定稿于 persona-prompt-v1),资产本体在此,brief 只留过程。
- `roles.ts` — WORKER_ROLE_SPECS / buildRoles:worker 角色定义与受限工具装配(spawn 用)。

## 规则

- 改人格不许直接拍:提案落 brief → 按 P4 的三方回测法(同模型换 prompt 对比)出报告 → 过了再改 `persona.ts`,并在文件头记版本与依据。
- 角色的工具子集只能收窄,不能越过 `tools/` 的安全边界(fs 沙箱、网络白名单)。
