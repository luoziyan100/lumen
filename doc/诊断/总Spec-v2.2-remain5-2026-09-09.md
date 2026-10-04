# 总Spec v2.2 remain5 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain5-2026-09-09`。测试体系候选 `test-system-v1-gov-remain5-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain5-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain5-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain4-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F16-HAN-03 | covered | CT-F16-010：live.pid=`process.pid` 与 job.pid 一致，job running/healthy，本地 TCP 可连；lastExit=1 不得否决 running；decideInstallAction=already，不得 bootstrap/conflict。未碰生产 label / PID 71847 / 不 install / 不 bootout |
| F16-HAN-04 | covered | CT-F16-011：live=null 或端口不可连且无确认 PID + job 缺失 → decideInstallAction=bootstrap；未知活 PID+可连端口必须 conflict，不得 bootstrap。只测判定，未真执行 bootstrap / launchd:install。未碰生产 label / PID 71847 |
| F01-DEC-01 | partial | CT-F01-017：向真实 WS 发送非法 rename_project / archive_project / install_skill / update_bad_case（缺字段/坏形状），error 后 settings 不改、无新 task/项目/skill/bad_case，随后合法 list 仍结算。仍缺 uninstall_skill / activate_skill / archive_task / rename_task / pin_task 及诊断回放写入口等其余写入口。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- F16-HAN-03 不是只扫旧 f16 字符串：活 PID + 真实 TCP + lastExit=1 仍 already。
- F16-HAN-04 不是只复述旧字符串：端口不可连且无确认 PID 才 bootstrap；未知活 PID 必须 conflict。
- F01-DEC-01 / F13-REQ-07 禁止标 covered。

## 建议通过点

job PID 与可连 portfile 一致且 running 时 already，lastExit=1 不得否决。无确认活持有者且 job 缺失才 bootstrap；未知活 PID 必须 conflict。非法 rename_project / archive_project / install_skill / update_bad_case 不改盘、不建 task/项目/skill/bad_case。

## 建议打回点

- F01-DEC-01 仍缺 uninstall_skill / activate_skill / archive_task / rename_task / pin_task 及诊断回放写入口等其余写入口全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- DEL-INTENT-UNKNOWN 仍缺 intent 落盘交叉；停放环境行仍 uncovered。
- 只复述旧 f16 字符串、或真的 launchd:install / 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain5-2026-09-09；已完成 F16-HAN-03 job PID 匹配 already 与 F16-HAN-04 无活持有者才 bootstrap；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `158f1a18b90fef8719306fd9375752a2971e5611323f222026d07990e199d9a2` |
| `doc/诊断/CLAUDE.md` | `0b58e29184291c169b0056d43f8cba184f1c3e0e8c7a96dc199d686136a94621` |
| `packages/agent-service/tests/CLAUDE.md` | `15686eeb9b7d092ea36583807cb02038c10f65844db42786d6597476e840cd16` |
| `packages/agent-service/tests/service/ct-f01-017.test.ts` | `139c1deefd221d5bd7701e035675f1a5cf031498119168d052ec6ffbacfaabd3` |
| `packages/agent-service/tests/service/ct-f16-010.test.ts` | `dcd232b562b49973aab228832767c8f68644cb0b4e1ba82574e23af50574865b` |
| `packages/agent-service/tests/service/ct-f16-011.test.ts` | `554a284fa0eaac2bb5298bb9c8ac492d102e2b0f85062ef9cefe5c751b053fa9` |

aggregate = `c1112baf6472ee8d0961e4716759bf1e4d77baa891ff0d32108aac56664d080d`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `0d9ed461ef735848509b8e83c7895ef76b912261ca8bbe6df21b057a3e43a254`
