# Mermaid 可读性（停拉伸 · 官方 ELK · persona 安全子集）

状态: **现行（决策+履约）** · 2026-08-31  
分支语境: `experiment/glass-ui`  
决策编号: **R1′**（可读性本轮；语法管线仍是 `doc/mermaid-pipeline.md` 的 S4′）

> [PROTOCOL] 变更时更新此头部与下方修订记录，再动代码；完成后检查 `doc/CLAUDE.md` 状态表。  
> 本文是**可审计的设计与实现合同**：不依赖聊天历史。审计方只读本文 + 锚点源码即可判定「做了什么 / 没做什么」。  
> 语法出图（Phase A/B、R1–R7、同源 parse）以 `doc/mermaid-pipeline.md` 为宪法；本文**不重开**那条漏斗，只锁本轮可读性三刀。

---

## 状态 / 日期 / 作者意图

| 字段 | 值 |
|------|-----|
| 状态 | 现行（决策已与 owner 对齐；实现按本文合同履约） |
| 日期 | 2026-08-16 |
| 作者意图 | 对话窗里要一张**能读的流程图**（层次清楚、线正交、放大/缩放已有），并且**高概率真的能渲染**。本轮只动三件事：停 SVG 拉伸、官方 mermaid ELK、persona 安全子集。 |
| 所有者 | Lumen UI + agent-service（双包） |
| 与 S4′ 关系 | **正交叠加**：S4′ 管「出图/失败诚实」；R1′ 管「画出来之后好不好读」。不得用本文推翻 Phase A/B。 |

### 修订记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-08-16 | 初版：锁定停拉伸 + 官方 ELK + persona 安全子集；否决 beautiful-mermaid / IR·S5 / R8+ | 会话决策落盘并履约 |
| 2026-08-31 | 叠加：最终几何一次进入主流(箱外 tighten);不停拉伸/ELK/Phase A/B 合同 | 跳动修复 |
| 2026-08-31 | 宿主展示改为固有宽 + 内层真横滚;缓存 SVG 不再写卡片 `max-width:100%`;lightbox 单独 fit;persona 长链优先 TD | 数学/宽图 brief |

---

## 问题（现象，附 session/task 若有：记忆层图扁、中文中词折行、线乱）

用户可见的不是「Parse error」（那是 S4′ 已覆盖的出图失败），而是**出了图但读不动**。

| 现象 | 现场 / 痕迹 | 机制（本轮要动的层） |
|------|-------------|----------------------|
| **记忆层图扁** | 记忆层 / 架构类 `flowchart TB`（含 Phase B 夹具语义：`packages/agent-service/scripts/inject-mermaid-phase-b-fixture.ts` 的 `subgraph mem [记忆层]`；真实研究会话里同类 TB 图）在对话栏被拉成扁条，节点间距被横向撑开 | `tightenSvgInk` 在收紧 viewBox 后写了 `svg.style.width = '100%'`。卡片栏很宽 → 固有宽被丢弃 → TB 图被横向拉伸。CSS `.mermaid-svg svg` 已是 `max-width:100%; margin:auto`，JS 把 width 盖成 100% 抵消了「量完再装盒」 |
| **中文中词折行** | 节点标签写成论述句（「短 ID + 长标签」合同在邀请这么写）；中文在 `htmlLabels` 下按宽度硬折，词中断开 | **生成合同**问题，不是再加一条 Phase A 规则能根治。本轮改 persona：标签=短标题，解释在围栏外 |
| **线乱** | 多节点 flowchart 边走 dagre 曲线，交叉、斜穿、不像层次图 | mermaid 11 默认 flowchart 渲染器仍是 dagre；正交折线是 **ELK layered** 的能力。官方已把 ELK 拆到 `@mermaid-js/layout-elk`，不注册则 `defaultRenderer:'elk'` 无效 |

**不是本轮问题（已由 S4′ 处理，禁止借可读性重开）：**

- 标签内裸 `{sessionId}` → `DIAMOND_START`（R2；触发 task `task-5bacbbc0-b95c-445b-b21a-562ebdc3543f`）
- 漏 `]`、弯引号、` -> `（R1/R5/R7）
- 规则仍失败后的「尝试修复」（Phase B sidecar）
- 严重失败出示源码（owner 对照 Codex 后接受）

---

## 第一性原理目标（出图 vs 好看 vs 业务正确 — 三层拆开）

三层**不是**同一个优化目标，禁止用一层的手段去「保证」另一层。

| 层 | 问的问题 | 成功长什么样 | 本轮手段 | 明确不是 |
|----|----------|--------------|----------|----------|
| **出图** | 这张 DSL 能不能被官方 mermaid 画出来？ | 高频脏数据零模型调用可渲；仍失败则源码可见 + 可选 1 次 sidecar | **不改**。继续 Phase A R1–R7 + 同源 `parse`/`render` + Phase B | 不加 R8+；不自动打主循环；不用非官方 parser 当最终门 |
| **好看 / 可读** | 画出来的像素在对话栏里能不能扫读？ | 小图固有宽居中、不铺满栏;宽图保持固有宽并由 `.mermaid-scroll` 完整横滚;文字等效 ≥12px;flowchart 边尽量正交;放大层已有 | **停拉伸** + **官方 ELK** + 宿主「量完再装盒」（viewBox 收紧 + **固有宽横滚**,禁止无下限 `max-width:100%` 缩字） | 不换渲染库；不重写主题/配色；不把 parse===render 当成美学宗教；渲染器不改 LR/TD |
| **业务正确** | 图意是否等于研究结论？ | 节点关系与论文/笔记一致；复制/历史仍是模型原文 | **不改**。repair 只修语法；落库不改 | 不上 IR/S5（锁图意要另开合同，达 pipeline §7.1 阈值） |

**本轮产品目标（owner 已拍板）：** 对话窗里一张可读的 flowchart（干净层次、正交线、放大/缩放已存在）+ 高概率真的能渲染。

**方法 vs 库：**

- **方法**（接受）：官方 ELK 正交布局 + measure-then-box（先量墨迹/固有宽，**卡片内保持固有像素并由内层滚动端口承载**；lightbox 单独 fit。**禁止**把 `width` 设成 100%，也**禁止**用 `max-width:100%` 把宽图缩到不可读）。
- **库**（推迟）：`beautiful-mermaid` 等第三方渲染器。须等「ELK + 停拉伸」被证明不够用，再单独立项。本文接受方法、推迟库。

`doc/mermaid-pipeline.md` 的「parse 与 render 必须同一 mermaid.js」是**出图层**不变式，不是美学教条。本轮仍用官方 mermaid.js，只改 layout（ELK）与宿主尺寸。

---

## 决策（做 / 不做）表

| 项 | 做？ | 说明 |
|----|------|------|
| 停 `tightenSvgInk` 写 `width:100%` | **做** | 保留 viewBox 收紧、`width`/`height` **属性**走固有像素、`height:auto`；**缓存 SVG 不得** `style.maxWidth='100%'`。卡片是否滚动、lightbox 是否 fit 由各自宿主 CSS 决定 |
| persona 安全子集（Codex 风格） | **做** | 长链/流水线优先 `flowchart TD`（约 ≥6 连续节点）；`LR` 只用于短链、并列比较或天然横向关系；简单 ID；标签加引号；禁止悬空边；分支 `-- "是" -->`；约 ≤15 节点否则拆图；避免裸括号、HTML、深层 subgraph、超长单行。**删除/改写「短 ID + 长标签」**，改为短标题；解释在围栏外。渲染器不改方向 |
| 官方 mermaid ELK | **做** | mermaid 11.16 需 `@mermaid-js/layout-elk` + `mermaid.registerLayoutLoaders`。initialize：`flowchart: { useMaxWidth:false, htmlLabels:true, padding:8, defaultRenderer:'elk' }`，并在注册成功时设顶层 `layout:'elk'`（mermaid 11 官方入口） |
| ELK 注册失败回退 dagre | **做** | 不硬崩；仍走现有 parse→render。日志/降级静默即可（用户仍能见图，只是曲线） |
| 保留既有引号 / 先闭合再写边 | **做** | 与 pipeline §5.3 第 2、7 条不矛盾，只叠加，不删 |
| Phase A R1–R7 | **冻结** | 不加 R8+ |
| Phase B `repair_mermaid` | **冻结** | 手动、同 hash 一次、不改落库 |
| 失败出示源码 | **保持** | owner 对照 Codex 后接受 |
| 换 `beautiful-mermaid` | **不做** | 见否决项 |
| IR / S5 | **不做** | 见否决项 |
| 自动主循环重试 | **不做** | 见否决项 |
| 新颜色 / 硬编码色 | **不做** | 只消费 tokens |
| 最终几何一次进入主流 | **做** | `mermaidMeasureHost` 箱外 tighten;主流只收 source 或 final SVG;Phase A/B 冻结项仍冻结 |

---

## 否决项与理由（beautiful-mermaid 本轮不接、IR/S5 本轮不上、不加 R8、不自动主循环重试）

| 否决 | 理由 | 何时可再议 |
|------|------|------------|
| **beautiful-mermaid 本轮不接** | 方法（ELK + measure-then-box）已接受；换库会引入第二套 parser/主题/打包面，破坏「本轮仍官方 mermaid.js」合同。未证明 ELK+停拉伸不够之前，换库是假需求 | ELK+停拉伸上线后仍系统性不可读（正交线仍乱 / 宿主尺寸仍扁），owner 书面指定 |
| **IR / S5 本轮不上** | 锁的是图意编译，不是可读像素。pipeline §3.5 / §7.1 C4 未达样本量。本轮问题在宿主拉伸与 dagre 曲线 | 规则+LLM repair 后仍 fail 的会话占比达阈值，或 owner 书面指定 |
| **不加 R8+** | 可读性不是再一条确定性正则。中文折行来自长标签合同，线乱来自 layout。往 Phase A 堆规则会误伤 sequence/class（已有 kind 门控教训） | 本地观测出现**新的高频语法**脏数据（不是美学） |
| **不自动主循环重试** | 与铁律「只增线程」和「落库原文不改」打架；费用即重试税。Phase B 已是合法的对模型通道 | pipeline O1 / C2：owner 明确要求或手动 repair ROI 达标 |
| **用 `json_schema` 锁 mermaid 字符串** | 分类错误（pipeline §3.5）；包装合法 ≠ 图合法 | 永不作为 mermaid 最终门 |
| **学 Cursor：失败图消失 / chat 不校验** | 已登记反模式。Lumen 必须同源 parse + 失败可见 | — |

---

## 不变式（改哪些、哪些冻结）

**本轮改（仅此）：**

1. 宿主 SVG **不得** `style.width='100%'`，**不得**把卡片 `max-width:100%` 写进缓存 SVG。小图固有宽居中；宽图固有宽 + `.mermaid-scroll` 真横滚。lightbox 宿主单独 `max-width/max-height` fit。
2. flowchart 在 ELK 注册成功后走官方 ELK（`defaultRenderer:'elk'` + `layout:'elk'`）。
3. persona 可视化段采用安全子集；禁止再写「短 ID + 长标签」。
4. pipeline §5.3 第 3 条与 persona **镜像同步**（短标题，不是长标签）。

**冻结（改了即违约）：**

| # | 不变式 | 锚点 |
|---|--------|------|
| F1 | Phase A 规则集 = R1–R7，kind 门控，不加 R8+ | `mermaidSyntax.ts` / pipeline §5 |
| F2 | parse 与 render 同一动态 import 的 mermaid 实例 | pipeline 不变式 2 |
| F3 | 复制 = 模型原文；像素 = 改写稿 | pipeline 不变式 1 |
| F4 | Phase B：`repair_mermaid` sidecar；同 hash ≤1；不改 `task_events` | pipeline §4.3 |
| F5 | 失败必须可见源码；禁止图块静默消失 | pipeline §2.1 / §6.2 |
| F6 | 对人报错在前端，对模型报错在 agent-service；禁止前端偷打 completion | pipeline 不变式 9 |
| F7 | 确定性 repair 不改节点 ID | pipeline 不变式 8 |
| F8 | 渲染器仍是官方 mermaid.js（+ 可选官方 ELK 包） | 本文 |
| F9 | 颜色只走 tokens / `mermaidSanitize` | `tokens.css` |

---

## 实现合同（将改哪些文件、改什么、不改什么）

### 将改

| 文件 | 改什么 |
|------|--------|
| `doc/mermaid-readability.md` | 本文（审计真源） |
| `doc/mermaid-pipeline.md` | 增补「可读性本轮」短节；§5 标明 R1–R7 冻结；§5.3 第 3 条改为短标题；状态表交叉引用 |
| `doc/CLAUDE.md` | 状态表增加本文 |
| `packages/ui-client/src/mermaid/mermaidLayout.ts` | ELK 注册（失败→false）、flowchart initialize 合同、SVG 固有尺寸归一（剥离百分比宽与卡片 max-width） |
| `packages/ui-client/src/components/MermaidBlock.tsx` | 箱外 tighten 后一次提交；initialize 接 ELK；头部 POS 指向本文 |
| `packages/ui-client/tests/mermaid-layout.test.ts` | AT1 固有尺寸政策；AT2 initialize 含 elk |
| `packages/ui-client/src/styles.css` | `.mermaid-scroll` 为滚动端口；`.mermaid-svg` 用 `max-content` + `min-width:100%` 居中小图；`> svg { max-width:none }`。`.mermaid-block { overflow:hidden }` **默认保留**（不禁用内层滚动）。lightbox `.mermaid-lightbox-stage svg` 单独 fit |
| `packages/agent-service/src/agents/persona.ts` | 安全子集 + 长链优先 TD；LR 仅短链/并列；保留引号/闭合/end 自检 |
| `packages/ui-client/CLAUDE.md`、`components/CLAUDE.md`、`agents/CLAUDE.md` | 成员职责回写 ELK / 固有宽横滚 / 安全子集 |
| `packages/agent-service/tests/agents/persona-mermaid.test.ts` | AT5：persona 含长链 TD、不含「短 ID + 长标签」 |

### 不改

| 文件 / 面 | 为什么 |
|-----------|--------|
| `mermaidSyntax.ts` 与 `tests/mermaid-syntax.test.ts` 的 R* 行为 | Phase A 冻结 |
| `mermaid-repair.ts` / `repair_mermaid` 协议字段 / 限次 / 落库语义 | Phase B 冻结 |
| 新 Phase A 规则、beautiful-mermaid、S5 IR、adapter `json_schema` | 否决项 |
| mermaid 主版本（保持 11.16.x） | 只加官方 layout 包 |

### ELK API（以 mermaid 11.16 + 官方包为准，禁止猜测）

查过 `node_modules/mermaid@11.16.0`：

- `MermaidConfig.layout?: string`
- `FlowchartDiagramConfig.defaultRenderer?: 'dagre-d3' \| 'dagre-wrapper' \| 'elk'`
- `mermaid.registerLayoutLoaders` 已导出

官方 `@mermaid-js/layout-elk` README（0.2.x，peer `mermaid@^11.0.2`，devDep 对齐 11.16.0）：

```ts
import elkLayouts from '@mermaid-js/layout-elk'
mermaid.registerLayoutLoaders(elkLayouts)
```

然后可用顶层 `layout: 'elk'` 或 `flowchart.defaultRenderer: 'elk'`。本轮**两者都设**（注册成功时），避免只走旧字段而 mermaid 11 忽略。

**回退：** `import('@mermaid-js/layout-elk')` 或 `registerLayoutLoaders` 抛错 → `elkReady=false` → initialize **不**带 `layout`/`defaultRenderer:'elk'` → dagre。禁止因此拒绝渲染。

---

## 验收标准 AT（可执行：AT1 停拉伸且宽图真横滚；AT2 flowchart 走 ELK；AT3 既有 mermaid-syntax 单测仍绿；AT4 Phase B 协议不动；AT5 persona 含安全子集）

| ID | 操作 | 预期 | 证据 |
|----|------|------|------|
| **AT1** | 读 `SVG_INTRINSIC_SIZE_POLICY` / 对假 SVG 调 `normalizeSvgIntrinsicSize` | `maxWidth==='none'`、`height==='auto'`、**不**存在 `style.width==='100%'`、**不**存在 inline `max-width:100%`。小图固有宽居中不铺满；宽图 `scrollWidth` 覆盖完整 SVG 宽；`scrollLeft=0` 见左端、最大值见右端；inline 等效字号 ≥12px | 单测 V1 + 重装后几何探针 |
| **AT2** | `elkReady===true` 时的 initialize 合同；并能 `import('@mermaid-js/layout-elk')` | `flowchart.defaultRenderer==='elk'` 且 `layout==='elk'`；`useMaxWidth===false`。注册失败路径返回 false 且配置不含 elk | 单测 V1 |
| **AT3** | `packages/ui-client` 既有 `mermaid-syntax` / `mermaid-sanitize` / `mermaid-zoom` | 全绿；R1–R7 行为不变 | `node --test` |
| **AT4** | 读 `mermaid-repair.ts` + `tests/runtime/mermaid-repair.test.ts` | 协议字段、同 hash 限 1、禁令文案、不改落库——本轮 diff 不碰这些文件的行为 | 单测绿 + diff 审查 |
| **AT5** | 读 `LUMEN_PERSONA` | 含：长链优先 TD、LR 用于短链/并列、引号标签、`-- "是" -->`、约 15 节点、短标题/围栏外解释、渲染器不会改方向；**不含**「短 ID + 长标签」；仍含先闭合再写边 | 单测 V1 |

E2E（owner）：重装 Lumen.app 后打开含 TB 与极宽 LR 的会话——小图不扁铺、宽图可横滚且左右端可达、字 ≥12px；坏图仍能见源码。

---

## 风险与回滚

| 风险 | 缓解 | 回退 |
|------|------|------|
| `@mermaid-js/layout-elk` 打包进 Tauri WebKit 失败 / 体积涨 | 动态 import；失败回退 dagre | 去掉 register 与依赖，initialize 回到本轮前 |
| ELK 对某些脏图比 dagre 更易 layout 失败 | 仍有同源 parse；layout 抛错走现有 catch → 源码卡 | `elkReady` 强制 false（代码开关或卸包） |
| 停拉伸后极宽 LR 图固有宽超过对话列 | `.mermaid-scroll` 必须出现 `scrollWidth > clientWidth`，且左右端均可 `scrollLeft` 到达。禁止再用 `max-width:100%` 把字缩到 <12px。`.mermaid-block overflow:hidden` **不是**滚动禁用开关（内层独立端口仍可滚）。宽 wrapper 自身等于内容宽，避免窄 flex 上 `justify-content:center` 造成左侧负溢出不可达 | 不恢复无下限缩小。WebKit 若对 `max-content+min-width:100%` 不一致，改等价 inline-flex/显式 wrapper 宽 |
| persona 安全子集让模型少画复杂图 | 这是目标：复杂交互走 show-widget；大图拆开 | 只回滚 persona 段，不动渲染 |
| ELK 正交仍不够「好看」 | **预期中的下一决策点**，不是本轮加库的理由 | 另开 brief；此时才评估 beautiful-mermaid |

**回滚动作（短）：**

1. 禁止把卡片 `max-width:100%` 写回缓存 SVG 或 `.mermaid-svg > svg`（那会再次缩掉极宽 LR）。停拉伸（禁 `style.width='100%'`）仍必须保留。  
2. 卸载 `@mermaid-js/layout-elk`，initialize 去掉 elk 字段。  
3. persona 可视化段回退到本轮前（保留引号/闭合）。  
4. Phase A/B **不必**回滚——本轮不该改它们。

---

## 证据/来源（mermaid #3659 useMaxWidth、Yank Note 剥 100%、官方 elk、Codex 员工/模型自述安全子集、Cursor forum chat 不校验）

| 来源 | 与本轮的关系 |
|------|----------------|
| [mermaid#3659](https://github.com/mermaid-js/mermaid/issues/3659) `useMaxWidth` | 官方承认 width=100% 让宿主失去固有宽。Lumen 已设 `useMaxWidth:false`，但 `tightenSvgInk` 又把 style.width 写回 100%，等于自己废掉这项。AT1 就是拆掉这处自相矛盾 |
| Yank Note 等宿主「剥 100%」 | 社区常规：渲染后去掉 SVG 的 100% 宽，改用固有宽 + max-width。本轮同构，不引入他们的编辑器 |
| 官方 [`@mermaid-js/layout-elk`](https://www.npmjs.com/package/@mermaid-js/layout-elk) + [layouts 文档](https://mermaid.js.org/config/layouts.html) | mermaid 11 起 ELK 不在核心包（许可拆分）。必须 `registerLayoutLoaders`。本轮只接这个官方包 |
| mermaid 11.16 类型：`defaultRenderer:'elk'` 与 `layout?: string` | 本地 `node_modules/mermaid/dist/config.type.d.ts` 已核对，不是训练记忆 |
| Codex 员工/模型自述安全子集 | flowchart TD/LR、简单 ID、引号标签、少节点、分支带标签、避免 HTML/深 subgraph——作为 **persona 劝说层**，不是 parser。Lumen 对照后采纳子集，**不**学 Codex「完全不内渲」 |
| Cursor forum：chat 不校验 mermaid | 反模式。pipeline 已否决「失败图消失 / 不 parse」。本轮不回退校验 |
| pipeline S4′（2026-08-11/16） | 出图漏斗已落地。本文叠加可读性，不重开选型 |

---

## 给审计 AI 的问题清单（5–8 个是/否或指出矛盾的问题）

请只根据**本文 + 仓库当前 diff/源码**回答。每题答「是 / 否 / 矛盾（指出哪两段打架）」。不要发明聊天里没写进本文的需求。

1. 本文是否把「出图 / 好看 / 业务正确」拆成三层，且本轮代码只被授权改「好看」的宿主层（停拉伸 + 官方 ELK）和 persona 劝说层？  
2. 否决项是否同时覆盖这四件：**不接 beautiful-mermaid、不上 IR/S5、不加 R8、不自动主循环重试**，并且理由不是「以后再说」而是可再议条件？  
3. 实现合同是否**禁止**改 `mermaidSyntax.ts` 的 R1–R7 行为，以及禁止改 Phase B `repair_mermaid` 的限次/落库语义？  
4. AT1 是否可执行地禁止 `style.width='100%'` **以及** 缓存 SVG 上的卡片 `max-width:100%`，并要求宽图 `scrollWidth` 覆盖固有宽、左右端可达、等效字号 ≥12px？（若 CSS/JS 仍把成功 SVG 缩进栏宽 → 标矛盾）  
5. AT2 是否要求 flowchart 走官方 ELK，且写明「注册失败回退 dagre、不硬崩」？实现是否真的有这条回退，而不是假设包一定加载成功？  
6. persona 是否已去掉「短 ID + 长标签」，改为短标题 + 围栏外解释，并且**仍保留**「标签加引号」与「先闭合再写边」？（丢掉后两条 → 标矛盾）  
7. 本文是否仍坚持官方 mermaid.js 同源 parse/render，只改 layout 与宿主尺寸——而不是把 pipeline「parser parity」理解成「连美学也不能换 layout」？  
8. 若 diff 里出现 beautiful-mermaid 依赖、新的 R8 函数、S5 IR 类型、或 `repair_mermaid` 自动进主循环：是否应直接判**违约**（是/否）？

---

## 一句话合同

**本轮把流程图从「能画」推进到「能读」：停 100% 拉伸、宽图固有宽真横滚、flowchart 走官方 ELK（失败回 dagre）、persona 长链优先 TD；出图漏斗与 Phase B 协议冻结；beautiful-mermaid / IR / R8 / 自动重试一律不准上车。**
