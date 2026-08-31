/**
 * [INPUT]: briefs/active/rendering L98 最小样本(非完整 JSONL)
 * [OUTPUT]: MATH_DIALECT_FIXTURE / WIDE_LR_FIXTURE
 * [POS]: 数学定界符与极宽 LR 图的回归夹具;禁止依赖会话文件读写
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** L98 数学方言:2 display + 4 inline,定界符为 \[ \] / \( \) */
export const MATH_DIALECT_FIXTURE = String.raw`
\[
\tau=(o_0,a_0,o_1,a_1,\ldots,o_T)
\]

- \(o_t\)
- 第 \(t\) 步
- \(a_t\)
- \(o_{t+1}\)

\[
R(x,\tau)\in\{0,1\}
\]
`

/** L98 末图:9 节点 flowchart LR,最长有向路约 8 步 */
export const WIDE_LR_FIXTURE = String.raw`flowchart LR
  H["当前 Harness"] --> R["运行任务"]
  X["任务输入"] --> R
  R --> T["执行轨迹"]
  T --> D["诊断行为"]
  D --> P["修改提案"]
  P --> C["候选 Harness"]
  C --> V["生成新轨迹"]
  V --> M["新旧轨迹比较"]`
