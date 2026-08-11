# Mermaid 渲染管线（校验 · 清洗 · 修复 · 降级）

状态: **现行（决策已锁定，实现按 Phase 推进）** · 2026-08-11  
分支语境: `experiment/glass-ui`（与 glass 主题、MermaidBlock 同栈）  
决策编号: **S4′**（HDD 选型 + 外部调研交叉验证）

> 本文是**可审计的设计与实现合同**：写清问题、证据、决策、非目标、分阶段验收与回退。  
> 实现未完成前，状态保持「现行（决策）」；Phase 全部落地后改为「现行（已履约）」并回写锚点。  
> 变更本决策须：先改本文并更新「修订记录」，再动代码。

---

## 0. 审计元数据

| 字段 | 值 |
|------|-----|
| 所有者 | Lumen UI + agent-service（双包） |
| 决策日期 | 2026-08-11 |
| 触发案例 | Session `task-5bacbbc0-b95c-445b-b21a-562ebdc3543f`：架构 flowchart 第 23 行 `sandbox/{sessionId}` 触发 `DIAMOND_START` parse error |
| 方法 | HDD 事前规划选型（S0–S6）+ 独立调研交叉（GenAIScript / Cursor / Claude / Codex / maid 等） |
| 证据等级（选型时） | **V3 有条件通过**（用户 V1 失败现场 + 产品原则 + 业界类比 V4；落地后以 AT Run 升至 V1） |
| 爆炸半径 | 中：交互与可选 1 次模型调用；可回退；不改历史 reply 落库语义 |

### 0.1 修订记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-08-11 | 初版：锁定 S4′、Phase A/B/C、AT、非目标、锚点 | 会话决策落盘 |

---

## 1. 问题陈述（可证伪）

### 1.1 用户可见现象

- 助手回复中的 ` ```mermaid ` 块在 UI 中显示 **Parse error**（含 lexer token 名，如 `DIAMOND_START`），图不可读。
- 同一会话正文结论往往正确；**失败集中在图 DSL**，不是整轮任务失败。

### 1.2 根因（已闭合的案例）

| 项 | 内容 |
|----|------|
| 痕迹 | 事件 `model_step`/`reply` 中完整 mermaid 源；第 23 行 `S[...sandbox/{sessionId}]` |
| 机制 | Mermaid flowchart 中 `{` 为菱形形状语法；未加引号的标签内路径模板被解析为 `DIAMOND_START` |
| 排他 | Session 文件完整、服务未截断图源；失败发生在前端 `mermaid.render`，非存盘损坏 |

**一般化根因**：LLM 生成的 Mermaid 是**不可信 DSL**；宿主仅做颜色 sanitize、无语法闸、无失败回传，必然系统性复现（非单次运气）。

### 1.3 现状锚点（决策时代码事实）

| 环节 | 路径 | 行为 |
|------|------|------|
| 人格/能力合同 | `packages/agent-service/src/agents/persona.ts` | 要求使用 mermaid 围栏；**无**引号/危险符硬规则 |
| 颜色清洗 | `packages/ui-client/src/mermaidSanitize.ts` | 语义 class / 字面色对比度；**无**语法修复 |
| 渲染 | `packages/ui-client/src/components/MermaidBlock.tsx` | `sanitize` → 直接 `mermaid.render`；catch 后全文 error + 源码 |
| 入口 | `packages/ui-client/src/components/Markdown.tsx` | `language-mermaid` → `MermaidBlock` |
| 回传 | — | **不存在** |

---

## 2. 目标与成功标准

### 2.1 目标（必须）

1. **出图率**：高频 AI 语法错误（未引号路径/`{}`/`()` 等）在**不调用模型**的情况下可渲染。  
2. **同源校验**：validate 与 render 使用**同一** `mermaid` 包版本 API（parser parity）。  
3. **失败诚实**：任意失败用户仍能看到源码；**禁止**图块静默消失（反 Cursor 已知差体验）。  
4. **有限自愈（Phase B）**：parse 仍失败时，可将错误与源码回传模型**最多 1 次**，只修 mermaid 块。  
5. **历史不篡改**：repair 成功只影响**当前 UI 展示**；不重写已入库 `reply`/`model_step` 正文（审计与回放一致）。

### 2.2 非目标（明确不做）

| 非目标 | 理由 |
|--------|------|
| 保证模型永远输出合法 Mermaid | 业界共识：不可能；靠管线兜底 |
| 替换 mermaid.js | 无必要 |
| 默认无限 repair 循环 | 成本与死循环风险 |
| 用非官方/非同源「轻量假校验」作为最终门 | parser parity 坑 |
| 默认强制模型只输出 JSON 再转图（Vizlayer 路线） | 表达力与迁移成本；列为远期选项 |
| 学 Cursor：失败时图消失 | 已登记为反模式 |
| Codex 式完全不内渲 | 与 Lumen「对话内见图」产品形态冲突；可保留「复制源码」旁路 |

---

## 3. 决策

### 3.1 选定策略：**S4′ 分层漏斗**

```
① Prompt 约束（persona 能力合同）
② 确定性语法 repair（程序）
③ 颜色 sanitize（已有）
④ 官方同源 mermaid.parse
   ├─ ok → mermaid.render → 预览；可切源码
   └─ fail → ⑤ 友好降级
              └─（Phase B）用户触发或可选自动：≤1 次 LLM repair → 回到 ②–④
```

### 3.2 候选对照（审计用，选型时）

| ID | 策略 | 结论 |
|----|------|------|
| S0 | 维持现状 | **否决**（V1 失败体验） |
| S1 | 仅友好错误 UI | **不足**（不出图率不变） |
| S2 | 仅规则清洗 | **必要但不充分** |
| S3 | 仅 LLM repair | **否决为唯一手段**（贵；`{sessionId}` 不该打模型） |
| **S4′** | 规则 + 同源 parse + ≤1 repair + 降级 | **采纳** |
| S5 | 模型 JSON → 宿主生成 Mermaid | **远期**，非本决策主路径 |
| S6 | 外置 maid 为主门 | **可选实现手段**，不得替代同源 parse |

### 3.3 产品对照（学什么 / 不学什么）

| 来源 | 行为 | Lumen 态度 |
|------|------|------------|
| GenAIScript | parse 失败 → 错误回传 LLM 修图 | **学**：Phase B，限 1 次 |
| Claude.ai | Code / Preview 切换 | **学**：成功/失败均可看源码 |
| Cursor | 类型白名单误解析；失败图消失 | **不学** |
| Codex | 生成与渲染分离 | **学**：复制/导出源码；**不**放弃内渲 |
| @probelabs/maid | 确定性 autofix + 语义校验 | **可参考规则**；最终门仍官方 parse |
| 本仓既有 | 颜色 sanitize、失败已有源码回退 | **保留并扩展** |

### 3.4 关键不变式（实现必须遵守）

1. **原文优先**：工具条「复制」始终复制**模型原文**（或用户可见的权威源），颜色/语法改写仅服务渲染像素。  
2. **同源 parity**：`parse` 与 `render` 必须来自同一动态 import 的 `mermaid` 实例/版本。  
3. **repair 上限**：同一图源（建议 `hash(source)`）自动+手动合计 **≤ 1 次** 模型调用（除非用户明确二次请求且产品允许再 1 次——默认不允许自动二次）。  
4. **repair 范围**：模型只被允许输出修正后的 mermaid 围栏；不得要求重写整篇研究结论。  
5. **落库不变**：`task_events` 中历史 `reply` 内容不因 UI repair 被 patch。  
6. **真实路径**：测试与验收禁止 mock「渲染成功」冒充 parse 通过（项目铁律）。

---

## 4. 架构与数据流

### 4.1 逻辑组件

| 组件 | 包 | 职责 |
|------|-----|------|
| Persona 可视化合同 | agent-service | 第 ① 层生成约束 |
| `mermaidSyntax`（拟） | ui-client | 图类型探测、确定性语法 repair、错误摘要 |
| `mermaidSanitize`（既有+扩展） | ui-client | 颜色/对比度；可组合 `prepareMermaid` |
| `MermaidBlock` | ui-client | 管线编排、Preview/Code、降级 UI、触发 repair |
| `repair_mermaid`（Phase B） | agent-service 协议 + runtime | 单次无工具 chat，抽取修正块 |

### 4.2 前端准备函数（合同）

```
prepareMermaid(raw: string) → {
  kind: DiagramKind | 'unknown'
  source: string          // 供 parse/render 的改写稿
  actions: string[]       // 审计日志：做了哪些规则修复
}

validateMermaid(source: string, mermaidApi) →
  ok | { error: string }  // 必须调用官方 parse
```

推荐入口命名（实现可微调，但语义不变）：

- `detectDiagramKind`
- `repairMermaidSyntax`
- `summarizeParseError`
- `prepareAndValidate`（prepare + parse）

### 4.3 Phase B 协议草图（审计用；实现时与 `protocol/messages.ts` 同步）

**Client → Server**

```json
{
  "type": "repair_mermaid",
  "task_id": "<uuid>",
  "project_id": "<optional>",
  "source": "<original or last attempted mermaid body>",
  "error": "<summarized parse error>"
}
```

**Server → Client**

```json
{ "type": "ok", "source": "<fixed mermaid body only>" }
```
或
```json
{ "type": "error", "message": "<reason>" }
```

**服务端约束**

- 鉴权与 task 归属与现有 WS 命令一致。  
- 单次 completion；`maxSteps`/工具：禁止工具或强制 0 工具。  
- 从模型输出中**只抽取第一个** ` ```mermaid ` 围栏 body。  
- 超时与失败映射为 `type: error`，不得悬挂。

**客户端约束**

- 成功：仅更新该 `MermaidBlock` 本地展示 state，再跑 prepare → parse → render。  
- 仍失败：保持降级卡；文案说明自动修复未成功。  
- 展示可选微提示：「图已在本地修正（历史消息正文未改）」。

---

## 5. 确定性语法规则（Phase A 最小集）

实现必须覆盖；每条应有单测。

| ID | 规则 | 典型输入 | 预期 |
|----|------|----------|------|
| R1 | 弯引号规范化 | `“标签”` | 直引号 |
| R2 | 未加引号标签含 `{}` | `S[.../{sessionId}]` | `S[".../{sessionId}"]`（形状括号类型保持） |
| R3 | 未加引号标签含 `()` 等危险符 | 路径/函数式文案 | 标签加双引号 |
| R4 | 已加引号标签 | `A["a{b}"]` | **不**重复包裹、不破坏转义 |
| R5 | 常见错误箭头 | 独立 ` -> ` | ` --> `（避免误伤） |
| R6 | 错误摘要 | 长 lexer 消息 | ≤3 行人类可读摘要 |

**故意不做（A 阶段）**：猜测补全缺失的 `end`、删除节点、改写图意。

### 5.1 Prompt 规则（与 R* 镜像，写入 persona）

1. 节点/边标签一律 `ID["..."]` 或菱形 `ID{"..."}`（文字在引号内）。  
2. 含路径、模板、`{}`、`()`、`/` 的文案必须在引号内。  
3. 短 ID + 长标签；禁止用保留字 `end` 作节点 ID。  
4. `subgraph` / `alt` / `loop` 与 `end` 成对。  
5. 优先 `flowchart TD|LR` 与 `-->`；复杂交互优先 `show-widget`。

---

## 6. UI 合同

### 6.1 状态

| 状态 | 用户可见 |
|------|----------|
| pending | 「正在绘制…」 |
| ok | SVG；工具条：放大、复制原文、**源码/预览**切换 |
| error | 短错误 + 源码（默认可见）；复制原文；**尝试修复**（Phase B） |
| repairing | 修复中禁用重复点击 |

### 6.2 反模式检查表（验收必查）

- [ ] 失败时图块未消失  
- [ ] 默认不展示完整 `Expecting 'SQE', ...` 长列表（可「详情」展开）  
- [ ] 未知 diagram 类型不伪装成 flowchart 语法错误（若可检测 kind）  
- [ ] 复制内容为权威原文（见不变式 1）

---

## 7. 分阶段实现与验收

### Phase A — 止血（仅 ui-client + persona，无服务端）

| 工作项 | 交付物 |
|--------|--------|
| A1 | 新建语法模块 + 单测（R1–R6，至少含 session 复现 fixture） |
| A2 | `MermaidBlock`：prepare → parse → render |
| A3 | 错误 UI 压缩 + 源码可见 |
| A4 | Preview / Code 切换 |
| A5 | `persona.ts` 规则段更新 |

**Phase A 验收（AT-A）**

| ID | 操作 | 预期 | 证据类型 |
|----|------|------|----------|
| AT-A1 | 注入 `task-5bacbbc0` 同构源码（含裸 `{sessionId}`） | **零**额外模型调用下渲染成功 | V1 |
| AT-A2 | 合法简单 flowchart | 与现网一致可渲 | V1 |
| AT-A3 | 故意破坏语法且规则无法修 | 短错误 + 源码可见；非空白 | V1 |
| AT-A4 | 点击复制 | 剪贴板为输入原文 | V1 |
| AT-A5 | 现有 `mermaid-sanitize` 测试 | 全绿 | V1 |

### Phase B — 有限 repair（agent-service + UI）

| 工作项 | 交付物 |
|--------|--------|
| B1 | WS `repair_mermaid` 与 handler |
| B2 | 单次无工具 completion + 抽围栏 |
| B3 | MermaidBlock「尝试修复」接线 |
| B4 | 同源限次（hash）+ 超时 |

**Phase B 验收（AT-B）**

| ID | 操作 | 预期 |
|----|------|------|
| AT-B1 | 规则无法修的坏图（如缺 `end`）点「尝试修复」 | ≤1 次模型调用后可渲 **或** 明确失败文案 |
| AT-B2 | 同一源再次点修复 | 被拒绝或 no-op（限次） |
| AT-B3 | 修复成功后刷新/重载会话 | **落库正文仍为原文**；展示策略按实现说明（本地修正不落库） |
| AT-B4 | 修复过程中断网/超时 | error 回执；UI 不悬挂 |

### Phase C — 可选增强

| 项 | 说明 | 触发条件 |
|----|------|----------|
| C1 | subgraph/`end` 平衡启发 | A/B 后仍高频结构错 |
| C2 | 设置「失败时自动 repair 一次」 | 用户明确要求少点击 |
| C3 | maid safe 规则子集移植 | 规则债增加时 |
| C4 | S5 JSON→Mermaid | S4′ 后失败率仍不可接受 |

---

## 8. 测试与证据纪律

1. **单测**：语法规则、prepare 组合、错误摘要；fixture 含真实失败样例。  
2. **组件/集成**：失败 UI、切换、限次；Phase B mock transport 可测协议，**真 parse 不得 mock 成功**。  
3. **E2E（用户）**：用真实研究会话出图；至少 1 条曾失败类路径。  
4. **证据分级**：宣称「已修复 session 类错误」须 **V1**（本地注入同源 fixture 渲染成功）。

---

## 9. 风险与回退

| 风险 | 缓解 | 回退 |
|------|------|------|
| 规则误伤合法图 | 单测 R4；仅未引号路径触发 | 关闭 repair 规则 flag / 回退 commit |
| repair 改坏图意 | prompt 只修语法；限 1 次 | 用户切源码看原文 |
| 费用 | 默认手动触发 repair | 不启用自动 |
| parity 漂移 | 锁定 package 版本；parse/render 同 import | — |

**回退开关（建议）**

- `LUMEN_MERMAID_SYNTAX_REPAIR=0`：跳过语法 repair，行为接近决策前（仍建议保留短错误 UI）。  
- `LUMEN_MERMAID_LLM_REPAIR=0`：隐藏/禁用「尝试修复」。

---

## 10. 实现锚点（落地后回写）

> 下列路径在实现时填写「已落地」；审计时以代码与测试为准。

| 能力 | 路径 | 状态 |
|------|------|------|
| 语法 repair | `packages/ui-client/src/mermaidSyntax.ts`（拟） | **待建** |
| 颜色 sanitize | `packages/ui-client/src/mermaidSanitize.ts` | 已有（仅颜色） |
| 渲染块 | `packages/ui-client/src/components/MermaidBlock.tsx` | 待接管线 |
| Markdown 入口 | `packages/ui-client/src/components/Markdown.tsx` | 已有 |
| 语法单测 | `packages/ui-client/tests/mermaid-syntax.test.ts`（拟） | **待建** |
| 颜色单测 | `packages/ui-client/tests/mermaid-sanitize.test.ts` | 已有 |
| Persona | `packages/agent-service/src/agents/persona.ts` | 待补规则 |
| Repair 协议 | `packages/agent-service/src/protocol/messages.ts` 等 | **Phase B 待建** |

---

## 11. 开放问题（未决，不阻塞 Phase A）

| ID | 问题 | 默认倾向 |
|----|------|----------|
| O1 | 首次失败是否静默自动 repair | **否**（手动按钮）；可用设置打开 |
| O2 | repair 成功是否写回 session 旁路文件 | **否**（仅 UI state） |
| O3 | 是否依赖 `@probelabs/maid` | **否**（先自研最小 R1–R6） |

关闭开放问题须更新 §0.1 修订记录。

---

## 12. 一句话合同

**Lumen 不假设模型写出完美 Mermaid；宿主以「确定性清洗 + 官方同源校验 + 可选单次错误回传修复 + 源码降级」为唯一合法渲染路径。复制与历史以原文为准；像素以改写稿为准。**

---

## 附录 A · 触发案例摘要（审计附件）

- Task: `task-5bacbbc0-b95c-445b-b21a-562ebdc3543f`  
- 图意图：Open Cowork 沙箱三层架构 flowchart  
- 失败行（逻辑行号以源为准）：含  
  `S[SandboxSync / LimaSync<br/>rsync 到 VM 内 ~/.claude/sandbox/{sessionId}]`  
- 解析器症状：`got 'DIAMOND_START'`  
- 规则修复方向：标签双引号包裹 →  
  `S["SandboxSync / LimaSync<br/>rsync 到 VM 内 ~/.claude/sandbox/{sessionId}"]`

## 附录 B · 外部参照（非依赖）

- Microsoft GenAIScript: [Mermaids Unbroken](https://microsoft.github.io/genaiscript/blog/mermaids/)  
- [@probelabs/maid](https://github.com/probelabs/maid)  
- 产品对照：Claude Code/Preview；Cursor 失败消失（反例）；Codex 外置渲染（旁路参考）  
- 内部 HDD 选型：S4′（本会话 2026-08-11）
