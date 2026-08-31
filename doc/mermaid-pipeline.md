# Mermaid 渲染管线（校验 · 清洗 · 修复 · 降级）

状态: **现行（Phase A/B 已落地；Phase C 待阈值；可读性本轮见 `mermaid-readability.md`）** · 2026-08-16  
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
| 2026-08-11 | 外部 AI 审计反馈复核：采纳 kind 门控 / 实现约束 / 本地观测 / 错误映射；驳回或降级不当项（见 §13） | 主会话对照源码与产品形态 |
| 2026-08-11 | Phase A 落地：mermaidSyntax + MermaidBlock 管线 + persona 规则 + 单测 | 实现 |
| 2026-08-15 | R7：矩形 `ID["标签"` 漏 `]` 且下一 token 是边时补闭合（Omarchy 图） | 实现 |
| 2026-08-16 | 对照「保证 JSON」文：分层不可混；否决 `json_schema` 锁 mermaid 字符串；报错对人前端、对模型后端；本轮不上 Phase B/S5 | 会话决策落盘 |
| 2026-08-16 | Phase B 履约：`repair_mermaid` sidecar（手动、同 hash 限 1 次、不改落库） | 实现 |
| 2026-08-16 | 可读性本轮（R1′）交叉引用：`doc/mermaid-readability.md`；§5 R1–R7 冻结；§5.3 短标签 | 会话决策 |
| 2026-08-31 | 最终几何一次进入主流:箱外 measurement host 完成 tighten 后一次替换源码;Phase A/B、ELK、复制原文、失败源码冻结 | 跳动修复 |
| 2026-08-31 | 缓存 final SVG 不再携带卡片 max-width;宿主改为固有宽 + 内层真横滚;§5.3 长链优先 TD | 数学/宽图 brief |

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

### 1.4 2026-08-16 代码事实（对照 §1.3）

| 环节 | 现状 |
|------|------|
| Persona | 可视化合同已镜像 §5.3（含先闭合再写边）；仍是**劝说**，不是推理层截断 |
| 语法闸 | `mermaidSyntax.ts` R1–R7 + kind 门控；漏 `]` 等高频脏数据在前端补 |
| 最终门 | `MermaidBlock` 同源 `mermaid.parse` → **箱外** `render` + `tightenSvgInk` → 主流一次提交 final SVG；失败红字+源码。禁止 pending/raw SVG 进 `.messages-content` |
| 回传模型 | **Phase B 已接**：失败卡「尝试修复」→ `repair_mermaid` sidecar。仍不进主研究循环、不改 `task_events`。`model_retry` 只处理 API 运输层 |
| Structured Outputs | adapter **未接** `response_format: json_schema` |
| 出图通道 | 正文 ` ```mermaid ` 围栏；**不**走 tool_calls |

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
| 默认强制模型只输出 JSON 再转图（Vizlayer 路线） | 表达力与迁移成本；列为远期选项 **S5 / C4**，须达 §7.1 阈值或 owner 书面指定 |
| 用 Structured Outputs / `json_schema` 锁 `{ mermaid: string }` | **分类错误**：约束停在 JSON 层，图仍可能非法；见 §3.5 |
| 前端拿 key 偷打模型重试 | 绕过只增线程与事件源，违反铁律 |
| `reply` 定稿后后端扫围栏、自动再打主循环 | 用户已见终稿；费用/延迟即「重试税」；与落库原文不改打架 |
| 后端另起 mermaid 实例当最终门、前端盲信 | 破坏不变式 2（parser parity） |
| 学 Cursor：失败时图消失 | 已登记为反模式 |
| 主流 pending / raw SVG / rAF 再 tighten | 中间态不得进入 `.messages-content`;测量走箱外 host,禁止 `display:none` 后 `getBBox` |
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
| 「保证 JSON」面试文（劝说/schema/受限解码） | 现象同构；**不可**把 mermaid 源码当封闭 JSON 锁 | **学分层**；王者对图 = S5 锁 IR，见 §3.5 |

### 3.4 关键不变式（实现必须遵守）

1. **原文优先**：工具条「复制」始终复制**模型原文**（或用户可见的权威源），颜色/语法改写仅服务渲染像素。  
2. **同源 parity**：`parse` 与 `render` 必须来自同一动态 import 的 `mermaid` 实例/版本。  
3. **repair 上限**：同一图源（建议 `hash(source)`）自动+手动合计 **≤ 1 次** 模型调用（除非用户明确二次请求且产品允许再 1 次——默认不允许自动二次）。  
4. **repair 范围**：模型只被允许输出修正后的 mermaid 围栏；不得要求重写整篇研究结论。  
5. **落库不变**：`task_events` 中历史 `reply` 内容不因 UI repair 被 patch。  
6. **真实路径**：测试与验收禁止 mock「渲染成功」冒充 parse 通过（项目铁律）。  
7. **语法规则按图类型门控**：flowchart 专用规则不得套用到 sequence/class/er 等；`unknown` **只降级、不做形状/箭头类修复**（见 §5）。  
8. **确定性 repair 不得改节点 ID**：只允许改标签文本/引号/无害空白与全局弯引号；改 ID 会导致边断链。
9. **报错分层**：对人说话的失败（红字、源码、放大钮）只在前端；对模型说话的失败必须进 agent-service（sidecar `repair_mermaid` 或出图工具的 `tool_result`）。禁止前端偷打 completion。

### 3.5 与「保证 JSON」的分层对照（2026-08-16）

文章问的是对的题（概率模型吐脏 DSL），答案不能直接套到 mermaid。

**封闭 JSON vs 开放图。** 文章要的是 `order_id` + `amount` 满足 schema 就能下单：合法对象 = 合法业务数据。流程图不是。合法 mermaid 文本 ⊅ 能画的图；还要求 kind 对、括号配平、边连得上。Lumen 回复是论文式散文 + 偶尔插图，整轮 `json_schema` 会毁产品形态。

**三层不在一个维度（对照 S4′）。**

| 文章层 | 做法 | Lumen 对应 | 地位 |
|--------|------|------------|------|
| 青铜·劝说 | Prompt 恐吓 | `persona.ts` §5.3 镜像规则 | 有成功率，无保证；加条文 ≠ 架构升级 |
| 青铜·正则抠围栏 | 从废话提取 ` ```json ` | **不做最终门**；最终门是官方 `mermaid.parse` | R7 仍是窄规则，失败降级，不假装成功 |
| 青铜·报错重试 | 把 parse error 喂回模型 | **Phase B**（§4.3） | **已履约**。默认手动、同图源 ≤1 次、不改落库 |
| 白银·schema 注入 | Pydantic → prompt 尾 | 无；只有 few-shot + 规则清单 | 全 mermaid 文法灌进 prompt 又长又劝不住 |
| 白银·容错解析 | `json-repair` | R1–R7 + 颜色闸 | 救高频脏数据；救不了截断半图、缺 `end`、图意写崩 |
| 王者·Tool Calling | 参数通道，少废话 | 工具通道**已有**；图走正文围栏，**没用上** | 该锁的是图 IR，不是 mermaid 字符串 |
| 王者·Strict JSON | `response_format` + `strict` | adapter 未接 | 锁 `{ mermaid: string }` = 分类错误，**否决** |
| 王者·受限解码 | logits 置零 | 不托管推理；云 API 无 mermaid grammar | **现在借不了**；「100%」是面试修辞 |

**分类错误（否决）。** 用 Structured Outputs 包一层 `{ mermaid: string }`，得到的是包装合法、图仍可能非法。那是劝说外包了一层 JSON，不是截断。

**王者对图 = S5，锁 IR 不锁 DSL。** 模型经 tool_calls 输出 `{ kind, nodes[], edges[] }`，宿主编译 mermaid，再进 `prepareMermaid` → parse → render。正文仍自然语言。代价：subgraph / sequence 消息等表达力先砍一刀；IR 一复杂就回到「脏 JSON」——那时文章的 json-repair / strict 才第一次用对地方。触发仍是 §7.1 C4，未达样本量不上。

**报错放哪（关闭「前端还是后端」）。**

- **前端**：验收像素、R*、同源 parse/render、对人诚实（失败必须可见）。漏 `]` 不该打模型。
- **后端**（对模型说话），两种干净形状，都在 agent-service：
  1. **Sidecar（Phase B）**：前端发现失败并发 `repair_mermaid`；单次无工具 completion，只修这一块。不进主研究循环。图仍是正文附件时，先走这条。
  2. **主循环（S5）**：出图变 `emit_diagram`；失败当 `tool_result` 回灌同一条线程。与「下游拒收脏 JSON」同构。
- **今天**：对人半句已做；对模型半句走手动 sidecar（「尝试修复」）。
- 流式半截 mermaid **不要**学 partial-json 先画半张图（会闪错误卡）。`deferMath` 等围栏闭合是对的。show-widget 的 `extractWidgetCodePartial` 才是文章 partial-json 的对等物。
- 若练 Structured Outputs，**先锁 show-widget**（schema 小：`title` + `widget_code`），别先拿开放 DSL 开刀。

**明确不做（仍有效）：** S5 工具、adapter `json_schema` 锁 mermaid 字符串、把 parse 搬到 Node、默认自动再打主循环。

---

## 4. 架构与数据流

### 4.1 逻辑组件

| 组件 | 包 | 职责 |
|------|-----|------|
| Persona 可视化合同 | agent-service | 第 ① 层生成约束 |
| `mermaidSyntax` | ui-client | 图类型探测、确定性语法 repair、错误摘要（Phase A 已落地） |
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

> **Sidecar，不是主循环。** 前端发现失败后发令；后端单次无工具 completion。禁止 `reply` 定稿后再扫围栏自动续跑主研究循环。归属见 §3.5。

**Client → Server**（字段与全协议一致，用 camelCase）

```json
{
  "type": "repair_mermaid",
  "taskId": "<uuid>",
  "projectId": "<optional>",
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
- **Repair system/user 文案必须包含**（实现清单，不可只写在风险表）：  
  - 「只修正 Mermaid **语法**，保持节点关系与图意」  
  - 「**不要**重写围栏外的研究结论或整篇回复」  
  - 「只输出一个 ` ```mermaid ` 代码块，不要前言后语」

**客户端约束**

- 成功：仅更新该 `MermaidBlock` 本地展示 state，再跑 prepare → parse → render。  
- 仍失败：保持降级卡；文案说明自动修复未成功。  
- 展示可选微提示：「图已在本地修正（历史消息正文未改）」。  
- **会话内内存缓存**（不落库）：`hash(原文)` → `{ preparedSource?, svg?, mode }`，同会话再次挂载同图时跳过重复 parse/render（源变更则失效）。

---

## 5. 确定性语法规则（Phase A 最小集）

实现必须覆盖；每条应有单测。**先 `detectDiagramKind`，再按「适用类型」应用规则。**

| ID | 规则 | 适用类型 | 典型输入 | 预期 |
|----|------|----------|----------|------|
| R1 | 弯引号规范化 | **全部**（含 unknown） | `“标签”` | 直引号 |
| R2 | 未加引号标签含 `{}` | **仅** `flowchart` / `graph` | `S[.../{sessionId}]` | `S[".../{sessionId}"]`（外层形状括号保持） |
| R3 | 未加引号标签含 `()` 等危险符 | **仅** `flowchart` / `graph` | 路径/函数式文案 | 标签加双引号 |
| R4 | 已加引号标签不二次处理 | **仅** 对 R2/R3 扫描生效时 | `A["a{b}"]` / `A["say \"hi\""]` | **不**重复包裹、不截断转义 |
| R5 | 常见错误箭头 ` -> ` → ` --> ` | **仅** `flowchart` / `graph` | flowchart 边 | 改为 `-->`；**禁止**用于 sequence（`A->B:` 合法） |
| R6 | 错误摘要 | 渲染失败路径（全部 kind） | 长 lexer 消息 | 见 §5.2 |
| R7 | 矩形标签漏 `]` | **仅** `flowchart` / `graph` | `E["x" -. "贯穿" .-> A` | `E["x"] -. "贯穿" .-> A`；已有 `]` 不改；不改 ID |

**未知类型 `unknown`**：只跑 R1（弯引号）+ 颜色 sanitize；**禁止** R2/R3/R5/R7；parse 失败则降级并文案「未能识别图类型或语法无效」，不得伪装成 flowchart 专属错误。

**故意不做（A 阶段）**：猜测补全缺失的 `end`、删除节点、改写图意、修改节点 ID。

**本轮冻结（2026-08-16，R1′）：** R1–R7 为 Phase A 闭集，**不加 R8+**。可读性（停拉伸 / 官方 ELK / persona 安全子集）走 `doc/mermaid-readability.md`，不得借「线乱/图扁」往本表加规则。

### 5.1 实现约束（防正则误伤）

1. **配对扫描，禁止朴素子串 match**：识别节点形状时，扫描 `[]`/`()`/`{}`/`(())` 等需括号配对；**跳过已在双引号内的片段**；引号内 `\"` 不结束字符串。  
2. **R4 优先于 R2/R3**：已引号闭合的标签整段跳过。  
3. **禁止改节点 ID**：只改标签体或引号；边 `A --> B` 的 `A`/`B` 标识符不得被重写。  
4. **repair 后再官方 parse**：规则输出仍失败 → 降级（架构已保证）。  
5. **单测必含**：合法 `sequenceDiagram`（含 `A->B:`）、合法 `classDiagram`（含 `class Foo {`）、`A["say \"hi\""]`、触发案例 flowchart。

### 5.2 错误摘要（R6）格式

```
第 {line} 行附近 · {人话}
```

- `line`：优先取 mermaid 错误对象的 `loc`/消息中的 `line N`；不可得则省略行号。  
- **常见 token → 人话映射（最小表，可扩展）**：

| token / 模式 | 人话 |
|--------------|------|
| `DIAMOND_START` / 标签内未预期 `{` | 标签里的 `{` 未加引号（路径模板请写成 `ID["...{x}"]`） |
| `PQ` / 引号相关 | 引号未配对或使用了弯引号 |
| `EOF` / 未闭合 | 可能缺少 `end` 或围栏未闭合 |
| 默认 | 截断后的官方消息首行（≤120 字） |

完整 lexer 列表仅放在 UI「详情」折叠内。

### 5.3 Prompt 规则（与 R* 镜像，写入 persona）

1. 节点/边标签一律 `ID["..."]` 或菱形 `ID{"..."}`（文字在引号内）。  
2. 含路径、模板、`{}`、`()`、`/` 的文案必须在引号内。  
3. 简单短 ID + **短**标签（标题级，禁止把论述写进节点）；禁止用保留字 `end` 作节点 ID；解释写围栏外。  
4. **输出前自检**：数 `subgraph`/`alt`/`loop` 开启次数与 `end` 次数，**必须相等**后再结束围栏。  
5. 长链/流水线优先 `flowchart TD`；`LR` 只用于短链、并列比较或天然横向关系；复杂交互优先 `show-widget`。渲染器不改方向。  
6. sequence 用 `A->>B: 消息` 等序列语法，勿把 flowchart 习惯硬套进 sequence。
7. 节点形状必须先闭合再写边：`A["标签"] --> B`，禁止 `A["标签" --> B`。
8. 安全子集（节点约 ≤15、分支 `-- "是" -->`、避免裸括号/HTML/深 subgraph）以 `doc/mermaid-readability.md` 为准，与上列不矛盾。

---

## 6. UI 合同

### 6.1 状态

| 状态 | 用户可见 |
|------|----------|
| pending | 「正在绘制…」 |
| ok | SVG；工具条：放大、复制原文、**源码/预览**切换 |
| error | 短错误（§5.2）+ 源码（默认可见）；复制原文；**尝试修复**（Phase B） |
| repairing | 修复中禁用重复点击 |

### 6.2 反模式检查表（验收必查）

- [ ] 失败时图块未消失  
- [ ] 默认不展示完整 `Expecting 'SQE', ...` 长列表（可「详情」展开）  
- [ ] 未知 diagram 类型不伪装成 flowchart 语法错误  
- [ ] 复制内容为权威原文（见不变式 1）  
- [ ] 合法 sequence/class 样例不被 R2/R3/R5 改坏（见 §5.1）

---

## 7. 分阶段实现与验收

### Phase A — 止血（仅 ui-client + persona，无服务端）

| 工作项 | 交付物 |
|--------|--------|
| A1 | 新建语法模块 + 单测（R1–R6 **含 kind 门控**；session 复现 + sequence/class 负向） |
| A2 | `MermaidBlock`：prepare → parse → render；**内存 hash 缓存** |
| A3 | 错误 UI 压缩（§5.2）+ 源码可见 |
| A4 | Preview / Code 切换 |
| A5 | `persona.ts` 规则段更新（含 end 自检） |
| A6 | **本地观测计数**（§7.1；dev/log，非强制远程上报） |

**Phase A 验收（AT-A）**

| ID | 操作 | 预期 | 证据类型 |
|----|------|------|----------|
| AT-A1 | 注入 `task-5bacbbc0` 同构源码（含裸 `{sessionId}`） | **零**额外模型调用下渲染成功 | V1 |
| AT-A2 | 合法简单 flowchart | 与现网一致可渲 | V1 |
| AT-A3 | 故意破坏语法且规则无法修 | 短错误 + 源码可见；非空白 | V1 |
| AT-A4 | 点击复制 | 剪贴板为输入原文 | V1 |
| AT-A5 | 现有 `mermaid-sanitize` 测试 | 全绿 | V1 |
| AT-A6 | 合法 `sequenceDiagram` 含 `A->B:` | repair **后**仍 parse 成功（R5 未误伤） | V1 |
| AT-A7 | 合法 `classDiagram` 含 `class Foo {` | 同上（R2 未误伤） | V1 |
| AT-A8 | `E["x" -. "贯穿" .-> A`（漏 `]`） | repair 后补 `]`，已闭合节点不重复补 | V1 |

### Phase B — 有限 repair（agent-service + UI）

| 工作项 | 交付物 |
|--------|--------|
| B1 | WS `repair_mermaid` 与 handler |
| B2 | 单次无工具 completion + 抽围栏；**prompt 含 §4.3 三条禁令** |
| B3 | MermaidBlock「尝试修复」接线 |
| B4 | 同源限次（hash）+ 超时 |
| B5 | 观测：llm_repair 尝试/成功计数（§7.1） |

**Phase B 验收（AT-B）**

| ID | 操作 | 预期 |
|----|------|------|
| AT-B1 | 规则无法修的坏图（如缺 `end`）点「尝试修复」 | ≤1 次模型调用后可渲 **或** 明确失败文案 |
| AT-B2 | 同一源再次点修复 | 被拒绝或 no-op（限次） |
| AT-B3 | 修复成功后刷新/重载会话 | **落库正文仍为原文**；展示策略按实现说明（本地修正不落库） |
| AT-B4 | 修复过程中断网/超时 | error 回执；UI 不悬挂 |

### 7.1 观测层（Phase C 可证伪前提；Lumen 本地优先）

**原则**：Lumen 是本地研究客户端，**不强制**远程埋点/用户遥测；但必须有**可聚合的本地计数**，否则 Phase C「高频/不可接受」不可审计。

| 指标 | 记录方式 | 用途 |
|------|----------|------|
| `mermaid_parse_ok` / `mermaid_parse_fail` | 内存计数 + 可选 `console.debug` / agent-service 侧日志 | 失败率 |
| `mermaid_rule_hit.{R2,R3,…}` | 同上 | 哪条规则在干活 |
| `mermaid_rule_then_parse_ok` | 规则改写后 parse 成功次数 | 规则有效性 |
| `mermaid_llm_repair_attempt` / `_ok` | Phase B | repair ROI |

**Phase C 触发阈值（默认，可用数据推翻）**

| 条件 | 建议阈值 |
|------|----------|
| C1 end 平衡启发 | 连续 2 周本地统计中，**规则后仍 fail** 且错误摘要匹配「缺少 end/EOF」占比 **≥ 30%** 的 fail 样本 |
| C4 JSON 出图 | 规则+LLM repair 后仍 fail 的会话占比 **≥ 15%**（样本 n≥20 图）或 owner 书面指定 |
| C2 自动 repair | owner 明确要求；或手动 repair 点击率高且成功率 ≥ 70% |

未达样本量时 **不上 C**，避免拍脑袋。

### Phase C — 可选增强

| 项 | 说明 | 触发条件 |
|----|------|----------|
| C1 | subgraph/`end` 平衡启发 | §7.1 阈值 |
| C2 | 设置「失败时自动 repair 一次」 | §7.1 或 owner |
| C3 | maid safe 规则子集移植 | 规则债增加时 |
| C4 | S5 JSON→Mermaid | §7.1 阈值 |

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
| 规则误伤合法图 | **kind 门控**；配对扫描+跳过已引号；sequence/class 负向单测 | 关闭 syntax repair flag |
| 改 ID 导致断边 | 不变式 8；单测 | — |
| repair 改坏图意 | prompt 三条禁令（§4.3）；限 1 次 | 用户切源码看原文 |
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
| 语法 repair | `packages/ui-client/src/mermaidSyntax.ts` | **Phase A 已落地** |
| 颜色 sanitize | `packages/ui-client/src/mermaidSanitize.ts` | 已有（仅颜色） |
| 渲染块 | `packages/ui-client/src/components/MermaidBlock.tsx` | **Phase A 管线已接**；可读性见 `mermaidLayout.ts` |
| 布局/停拉伸 | `packages/ui-client/src/mermaidLayout.ts` | **R1′ 已落地**（ELK + 禁 100% 宽） |
| Markdown 入口 | `packages/ui-client/src/components/Markdown.tsx` | 已有 |
| 语法单测 | `packages/ui-client/tests/mermaid-syntax.test.ts` | **已落地** |
| 颜色单测 | `packages/ui-client/tests/mermaid-sanitize.test.ts` | 已有 |
| Persona | `packages/agent-service/src/agents/persona.ts` | **Phase A 规则已补**；R1′ 安全子集已写入 |
| Repair 协议 | `packages/agent-service/src/protocol/messages.ts` 等 | **Phase B 已落地**(`repair_mermaid` → `ok.source`) |
| Repair 核 | `packages/agent-service/src/runtime/mermaid-repair.ts` | **已落地** |

---

## 11. 开放问题（未决，不阻塞 Phase A）

| ID | 问题 | 默认倾向 |
|----|------|----------|
| O1 | 首次失败是否静默自动 repair | **否**（手动按钮）；可用设置打开 |
| O2 | repair 成功是否写回 session 旁路文件 | **否**（仅 UI state） |
| O3 | 是否依赖 `@probelabs/maid` | **否**（先自研最小 R1–R6） |
| O4 | 图报错处理在前端还是后端 | **已关闭（2026-08-16）**：对人前端、对模型后端；见 §3.5 / 不变式 9 |

关闭开放问题须更新 §0.1 修订记录。

---

## 11.5 可读性本轮（ELK + 停拉伸；2026-08-16）

> 出图漏斗不变。本小节只钉「画出来之后」的宿主合同；全文见 `doc/mermaid-readability.md`。

- **停拉伸 + 固有宽横滚**：`tightenSvgInk` 可收紧 viewBox、写固有 `width`/`height` 属性，**禁止** `style.width='100%'`，**禁止**把卡片 `max-width:100%` 写进缓存 SVG。卡片 CSS：`.mermaid-scroll` 真横滚；`.mermaid-svg` `max-content` + `min-width:100%`。lightbox 宿主单独 fit。
- **官方 ELK**：flowchart 注册 `@mermaid-js/layout-elk` 后 `defaultRenderer:'elk'`（+ `layout:'elk'`）。注册失败回退 dagre，不硬崩。
- **不换库**：仍官方 mermaid.js。`beautiful-mermaid` / IR·S5 / R8+ 见可读性文档否决项。
- **parser parity** 仍约束出图层（同一 mermaid 实例 parse+render），**不**禁止换官方 layout。
- **主流一次提交**：箱外 tighten 后只把 final SVG 送进 `.messages-content`；缓存键含列宽桶。

---

## 12. 一句话合同

**Lumen 不假设模型写出完美 Mermaid；宿主以「确定性清洗 + 官方同源校验 + 可选单次错误回传修复 + 源码降级」为唯一合法渲染路径。复制与历史以原文为准；像素以改写稿为准。对人说话的报错在前端，对模型说话的报错在后端；禁止用 `json_schema` 锁 mermaid 源文字符串冒充推理层截断。**

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
- 「保证 JSON」面试文（劝说 / Pydantic+json-repair / Tool Calling+Strict+受限解码）：现象同构，约束层不同；裁定见 §3.5

---

## 13. 外部 AI 审计反馈 · 主会话裁定（2026-08-11）

> 审计方**未读本仓库源码**；下列裁定结合 `MermaidBlock` / `mermaidSanitize` / persona 与 Lumen 本地优先形态。

| # | 审计主张 | 裁定 | 处理 |
|---|----------|------|------|
| 1 | R2/R3/R5 必须按图类型门控；unknown 不套 flowchart 规则 | **真问题** | 已写入不变式 7、§5 适用类型列、AT-A6/A7 |
| 2 | Phase C 缺「高频」可证伪定义，需埋点 | **真问题，力度需适配** | 采纳**本地计数**（§7.1），**不**强制远程上报（与 Lumen 本地研究客户端不符） |
| 3 | 正则引号/转义误伤；禁止改节点 ID | **真问题** | §5.1 实现约束 + 不变式 8 |
| 4a | R5 仅 flowchart | **真**（#1 子集） | 已门控 |
| 4b | 错误摘要用 loc + token 人话表 | **真，体验增强** | §5.2 |
| 4c | persona 输出前数 end | **真，零成本** | §5.3 第 4 条强化 |
| 4d | hash 内存缓存 | **真，小优化** | §4.3 客户端 + A2 |
| 5 | Phase B 协议 OK；prompt 勿丢「只改语法」 | **真确认** | §4.3 已列三条必写文案 |
| — | 「方案整体可按 Phase A 开工」 | **同意** | 方向不变 |
| — | 暗示需完整前端「上报」体系才可 C | **过重** | 用 §7.1 本地观测即可开证伪 |
| — | 暗示正则「几乎不可用」 | **过当** | 配对扫描 + 同源 parse 兜底；业界普遍规则层+parse |

**未改结论**：S4′ 漏斗与 Phase 划分不变；审计补强的是 **门控与实现纪律**，不是推翻选型。
