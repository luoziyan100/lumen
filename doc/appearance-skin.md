# 外观偏好与皮肤（Appearance / Skin）

状态: **内置明暗皮肤与玻璃/纸面材质已实现**（2026-10-05）
> 2026-11-11：通用 token 基线已迁入 `yan-design-system`(tokens/*.tokens.json → css/tokens.css)；下文所指 Lumen `tokens.css` 中的通用变量现以设计系统为准，Lumen `tokens.css` 只留皮肤背景槽、装饰色与布局尺寸。
类型: 产品 + 工程架构合同（**内置皮肤与切换链已实现**）
作者会话: Lumen UI；外部 AI 审计 §14–§16
历史对照分支: `experiment/glass-ui`（仅用于追溯最初的 Glass Beam 设计，不代表当前实现）

> 目标：在设置中增加「偏好 / 皮肤」能力，工程上解耦、可测、可演进；
> **不**引入对第三方闭源客户端的 CDP 注入方案。
> **换肤必须传导到 Lumen token 层与 Kumo 控件层**，禁止「自定义区变了、Button/Dialog 仍是旧青瓷」。
> **宿主 `color-scheme` 不得破坏 widget 内容岛判定**（D12 / R1）。
> **Kumo 表面槽不得 1:1 吃玻璃半透明 token**（D15 / R4），否则 default 观感回归失败。

---

## 0. 审计说明（给评审方）

本文档按 **可证伪 / 可追溯** 写就。评审时请分别判定：

| 章节 | 应判定的内容 | 通过标准 |
|------|----------------|----------|
| §1 问题 | 需求是否真实、边界是否清楚 | 问题陈述无可观察歧义 |
| §2 现状 | 对仓库事实是否准确 | 可对照路径复验 |
| §3 外部调研 | 类比是否标清等级 | ≤V4，未伪装 V1 |
| §4 HDD | 假设可证伪；证据等级诚实 | 事前规划未伪装现场复现 |
| §5 决策 | 解耦 + **Kumo 传导** | 换肤不改业务组件；控件层跟色 |
| §6 合同 | 类型 / 白名单 / resolve / apply | 可单测；含 Kumo 桥 |
| §7 分期 | 爆炸半径 | Phase A 含装饰面变量化 + Kumo 引用链 |
| §8 非目标 | 高风险项排除 | CDP / 任意 CSS 等 |
| §11 开放问题 | 是否阻塞 DEV | 勾选 |
| §14 外部审计 | F1–F9 是否闭环 | 每条有采纳/否决 |

**证据等级**：V1 现场 / V2 本仓闭合 / V3 部分 / V4 类比 / V5 纯推理（不得单独支撑决策）。

---

## 1. 问题

### 1.1 用户意图

- 设置中增加 **偏好 / 图片主题**（网格、模式、遮罩/模糊、后续上传）。
- 参考形态：ChatGPT/Codex 偏好 UI；工程参考 [Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 的**主题包合同与隔离哲学**，不参考其 CDP 管道。

### 1.2 工程约束

| 约束 | 说明 |
|------|------|
| 自有宿主 | 拥有 UI 源码，不做 CDP |
| 双消费层 | **Lumen tokens**（`styles.css` 等）+ **Kumo 合同变量**（Button/Dialog/…）必须同源可换 |
| 解耦 | 业务组件零 `skinId ===` 分支 |
| 隔离 | 外观 storage ≠ 模型 settings |
| 可读性 | 壁纸 + overlay/blur 保证正文对比度 |

### 1.3 成功定义（Phase A）

用户切换内置皮肤后：**画布背景、强调色、Kumo 主按钮/对话框品牌色**一致变化；刷新保持；消息列表不 remount。

---

## 2. 初始问题快照（2026-08-12 · 历史，当前实现见 §6/§10）

| 项 | 事实 | 路径 | 级 |
|----|------|------|-----|
| 主题挂载 | `html data-theme="celadon"` 写死 | `index.html` | V2 |
| Lumen token | `:root` **69 条行首** `--name:` 声明；其中 **5 处** 值为 `var(--其它token)` 别名（`--success`→moss 等，见 §6.2.1） | `tokens.css` | V2 |
| Beam 色 | 已有 `--beam-a/b/c` | `tokens.css` L96–98 | V2 |
| Kumo 映射 | **字面量烘焙**，非 `var(--canvas)` | `theme-celadon.css` L14–85，`[data-theme="celadon"]` | V2 |
| check:theme | `scripts/check-theme-celadon.mjs` | 名称、引用链与实色槽验证 |
| 画布 aurora | `.app::before` 硬编码青绿/紫/琥珀 rgba | `styles.css` ~L16–23 | V2 |
| composer 光 | `.composer-dock::before` 同类硬编码渐变 | `styles.css` ~L784–791 | V2 |
| glass-card | 部分用 `--beam-*`；另有硬编码高光 | `styles.css` `.glass-card` / beam | V2 |
| liquid-glass | 硬编码白/黑径向 + 动画边 | `styles.css` ~L1337+ | V2 |
| 设置导航 | 仅 model / prompt / service | `SettingsModal.tsx` | V2 |
| 外观持久化 | 无 | — | V2 |
| Widget | **暗壳**返回固定 `LIGHT_DOC_VARS`，**不**镜像宿主 token；仅浅壳镜像 | `themeVars.ts` L82–100 | V2 |

**关键推论（V2）**：仅 patch Lumen `--canvas/--ember` **不会**改变 Kumo Button/Dialog 颜色（F1）。仅改 `.app::before` **不会**去掉 composer/glass/liquid 上的青瓷光（F2）。

---

## 3. 外部调研（≤V4）

| 来源 | 可学 | 不学 |
|------|------|------|
| **VS Code** | 主题=数据包；semantic token；扩展贡献 | — |
| **ChatGPT 偏好** | Appearance 分区；壁纸+遮罩 | 闭源细节 |
| **DreamSkin** | ZIP 合同、导入≠启用、Safe 边界、与 API 隔离、失败回滚 | CDP 注入、对接其 ZIP 字节兼容 |

解耦通式（业界收敛）：

```text
Preference UI → AppearanceState → resolveTheme() → applyTheme() → CSS vars / data-*
组件只认 var(--*)，不认 skinId
```

---

## 4. HDD 摘要

| ID | 假设 | 判定 |
|----|------|------|
| H1 | 一等公民引擎，非 CDP | ✅ |
| H2 | State / Resolve / Apply + 组件零分支 | ✅ |
| H3 | Phase A = 内置皮肤 + effects，无上传/社区 | ✅ 默认 |
| H4 | 浅色与暗色同等优先 | ✅ 2026-10-05 真实浅色基线与三套明亮材质 |
| H5 | appearance 进 agent-service | ❌ A 用 localStorage |
| **H6**（审计增补） | **仅 patch Lumen token 不够；必须打通 Kumo 桥** | ✅ **V2 源码闭合** |

---

## 5. 决策

### 5.1 ADR

| ID | 决策 |
|----|------|
| **D1** | 管道：`AppearanceState → resolveTheme → applyTheme` |
| **D2** | 双轴：`mode`（对比度基线）× `skinId`（氛围包）+ 用户 `overlay`/`blurPx` |
| **D3** | 存储：`localStorage` 键 `lumen:appearance.v1`；**不**进模型 settings |
| **D4** | DOM：`data-appearance` / `data-skin`；**`data-theme="celadon"` 恒驻**（Kumo 选择器锚，见 D7） |
| **D5** | A 阶段皮肤只写**白名单 Lumen token**；禁止任意 CSS 字符串 |
| **D6** | 不兼容 DreamSkin ZIP 字节级 |
| **D7 · F1 解法 (a)** | **`theme-celadon.css` 改为引用 Lumen 语义变量**（见 §5.4），而非在 JS 里枚举 50+ Kumo 键逐个 apply。`check:theme` **升级**：合同名齐全 **且** 关键色变量值为 `var(--…)` 引用链（或维护「Lumen→Kumo 映射表」双向校验） |
| **D8 · F2** | Phase A **枚举全部装饰硬编码面**并变量化（§5.5），不只 `.app::before` |
| **D9 · F3** | 皮肤白名单 **扩大**（§6.2）；代码色/光边可随皮肤，或显式「锁死 celadon」——**默认随皮肤** |
| **D10 · F5** | mode 决定真实明暗；选肤同时设置推荐模式。皮肤主 tokens 对应 preferredScheme，另一模式使用 alternateTokens，缺失时保留该明暗基线 |
| **D11 · F7** | Widget 内容岛保持不透明浅色：暗壳固定 LIGHT_DOC_VARS，浅壳使用深墨与 surface-* 实色伴生；不镜像玻璃 alpha |
| **D12 · R1（2026-10-05 修订）** | 宿主 color-scheme 与实际 token 基线一致；apply 同步桌面窗口明暗。内容岛可读性通过独立实色表面保证，不再靠强制暗壳 |
| **D13 · R3** | Token **原语 vs 别名**写死：皮肤只 patch 原语；别名仅 CSS `var(--原语)`，**不进**皮肤白名单（§6.2.1） |
| **D14 · R2** | 浅色预设必须包含浅 canvas、深 ink、浅 Kumo 实色及轻阴影；material 区分 glass/paper，禁止仅换色相而继续套深黑底 |
| **D15 · R4** | **玻璃 / 实色分槽**：Lumen 玻璃 token（半透明）只服务 Lumen 壳层；Kumo 需要实色填充的键映射到 **实色伴生 token**（§5.4.1），禁止 `kumo-fill → var(--vellum)` 这类透明度泄漏。default 实色伴生 **等于当前 Kumo 字面量**，保障 AT9 |

### 5.2 模块布局

```text
packages/ui-client/src/appearance/
  types.ts / registry.ts / resolve.ts / apply.ts / store.ts / systemMode.ts

packages/ui-client/src/components/
  SettingsModal.tsx      # Pane += 'preference'
  PreferencePane.tsx

packages/ui-client/src/theme-celadon.css   # D7：引用桥（改造）
packages/ui-client/scripts/check-theme-celadon.mjs  # D7：引用链校验
packages/ui-client/src/styles.css          # D8：装饰面吃 --aurora-* / --beam-*
packages/ui-client/src/tokens.css          # 补 --aurora-* 等基线
```

### 5.3 数据流（修订 · 含 Kumo）

```text
PreferencePane → useAppearance → store → resolveTheme(state, system)
                                            │
                              明暗基线 + 皮肤对应模式补丁
                                            ▼
                                      applyTheme
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                  data-skin/material   Lumen CSS token   color-scheme / 原生窗口
                                            │
                                  theme-celadon 引用桥
                                            ▼
                                  Kumo 实色控件与深浅文字
                                            │
                         Widget 浅色内容岛（暗壳固定，浅壳实色伴生）
```

业务组件不得建立第二条 apply 路径，也不直接写 Kumo 变量。材质规则按 data-material 消费，不为每个新 skinId 增加组件分支。

### 5.4 Kumo 桥映射表（D7 · 合同 · 含 R4 透明度）

原则：

1. Kumo 变量 **只**通过 CSS 引用 Lumen 侧 token（或 `var()` 派生），皮肤 **不** 直接写 `--color-kumo-*`。
2. **R4**：映射必须区分 **「可半透明源」** vs **「必须实色槽」**。玻璃 token 1:1 接到 Kumo 实色控件 = default 观感回归（AT9 失败）。

#### 5.4.1 透明度政策（R4 · D15）

| 槽类型 | 定义 | 规则 |
|--------|------|------|
| **Solid 槽** | Kumo 控件底/填充，视觉上应接近不透明（按钮、菜单项、elevated 面） | **禁止** 引用 alpha&lt;0.9 的玻璃 token；必须引用 **实色伴生 token** 或字面量 allowlist |
| **Tint 槽** | 允许半透明的线、焦点、遮罩、品牌 tint | 可引用 `--sand` / `--focus-ring` / `--scrim` / `--ember-tint` 等 |
| **Ink 槽** | 文字色 | 引用 `--ink*`（实色或高不透明）；不得引用 vellum |

**实色伴生 token（Phase A 写入 `tokens.css` 基线）**
与当前 `theme-celadon.css` **字面量对齐**，保证 default 零观感漂移：

| 伴生 token（新 · 原语 · 可被皮肤 patch） | default 值（= 今日 Kumo） | 色相应对的玻璃 token（仅文档关联，非自动） |
|------------------------------------------|---------------------------|-----------------------------------------------|
| `--surface-canvas` | `#0B0C10` | 见 **R5**：与 `--canvas` **合同恒等** |
| `--surface-base` | `#14161C` | `--paper-solid` 的实色 peer |
| `--surface-elevated` | `#1E212A` | `--card` peer |
| `--surface-recessed` | `#101218` | `--paper-deep` peer |
| `--surface-control` | `#1A1D26` | `--paper` peer |
| `--surface-fill` | `#252833` | **不要**用 `--vellum`（9% 白） |
| `--surface-fill-hover` | `#2E323E` | fill hover |
| `--surface-interact` | `#2A2F3C` | interact |

**R5 · `--canvas` ↔ `--surface-canvas`（写死）**

| 规则 | 内容 |
|------|------|
| 合同 | Phase A 起二者 **语义恒等**：同一画布实色。default 均为 `#0B0C10`。 |
| 桥 | `--color-kumo-canvas: var(--surface-canvas)`（**只引伴生键**，不写「或 var(--canvas)」双路径）。 |
| 基线 | `tokens.css` 中推荐 `--surface-canvas: var(--canvas)` **或** 二者同字面量；若用 alias，则 `--canvas` 为原语、`--surface-canvas` 为别名——**此时 surface-canvas 按 §6.2.1 别名纪律：皮肤 patch 只动 `--canvas`，伴生跟随**。 |
| 变更 | 任一皮肤/基线改画布色：**必须同步**（patch 原语或成对字面量）。禁止只改其一导致「壳底 / Kumo 画布」漂移。 |
| 未来 | 若某皮肤要「带玻璃感的壳底」：只改 Lumen 另键（勿把 `--canvas` 改半透明），**不得**污染 `--surface-canvas` 的 Solid 不变量。 |

皮肤若只改玻璃 `--card` 而忘改 `--surface-elevated`：Lumen 卡片氛围变、Kumo 面仍旧——**允许**（两层解耦）；推荐预置皮肤 **成对 patch** 玻璃+伴生。
**禁止**为省事把 Kumo elevated 接到 `var(--card)`。

可选派生（若不想加伴生键）：`color-mix(in srgb, var(--card) 100%, var(--canvas))` **不能**可靠消掉 alpha；**不要**依赖 mix 当实色。伴生字面量 / 皮肤显式实色是 A 唯一推荐路径。

#### 5.4.2 桥表示例（修订后）

| Kumo 变量 | 引用 | 槽类型 |
|-----------|------|--------|
| `--color-kumo-canvas` | `var(--surface-canvas)` | Solid（R5：不引 `--canvas` 双路径） |
| `--color-kumo-base` | `var(--surface-base)` | Solid |
| `--color-kumo-elevated` | `var(--surface-elevated)` | Solid |
| `--color-kumo-recessed` | `var(--surface-recessed)` | Solid |
| `--color-kumo-control` | `var(--surface-control)` | Solid |
| `--color-kumo-fill` | `var(--surface-fill)` | Solid · **禁止 vellum** |
| `--color-kumo-fill-hover` | `var(--surface-fill-hover)` | Solid |
| `--color-kumo-interact` | `var(--surface-interact)` | Solid |
| `--color-kumo-contrast` | `var(--ink)` | Ink |
| `--color-kumo-hairline` / `line` | `var(--sand)` / `var(--sand-deep)` | Tint |
| `--color-kumo-focus` | `var(--focus-ring)` | Tint |
| `--color-kumo-brand` | `var(--ember)` | Solid（ember 为实色 hex） |
| `--color-kumo-brand-hover` | `var(--ember-soft)` | Solid |
| `--color-kumo-danger` | `var(--danger)` | Solid |
| `--color-kumo-warning` | `var(--warning)` | Solid |
| `--color-kumo-success` | `var(--success)` | Solid · **R6：`--success` 是别名**（见下） |
| `--color-kumo-info` | `var(--indigo)` | Solid |
| `--color-kumo-overlay` | `var(--scrim)` | Tint |
| `--text-color-kumo-default` | `var(--ink)` | Ink |
| `--text-color-kumo-subtle` | `var(--ink-mute)` | Ink |
| `--text-color-kumo-brand` | `var(--ember-soft)` | Ink |
| badge 等多色 | literalAllowlist 字面量 | — |

**R6 · 桥可引别名 ≠ 皮肤可 patch**

- 桥写 `--color-kumo-success: var(--success)` **合法**：运行时 `success → moss` 级联，换肤 patch `--moss` 即可跟色。
- `--success` **仍不在**皮肤白名单（§6.2.1）。皮肤写 `tokens["--success"]` → resolve **丢弃**。
- 文档读者勿因桥表示例出现 `--success` 而将其当作可调原语。

完整表落在 `theme-celadon.css`「桥」注释区。

**check:theme 合同（D7 + R4 + R7）**

| 规则 | 内容 |
|------|------|
| 名齐全 | 覆盖 Kumo 颜色合同变量（字号 exempt 照旧） |
| 引用或字面量 | 值匹配 `var(--…)` **或** 落在 `literalAllowlist` |
| solidSlotList | Solid 槽 Kumo 键 **禁止** 引用玻璃半透明族：`--paper`/`--card`/`--vellum`/`--paper-deep`/`--paper-solid` |
| **R7 · 白名单完备** | 皮肤 `AppearanceTokenName` 白名单 **必须包含全部** `--surface-*` 伴生键（与 solid 源一致）；缺键 = check 失败。Phase C `tokens.json` 校验 **复用同一白名单常量**（单源，禁止两套列表漂移） |

**不采纳 F1-(b)**。

### 5.5 装饰面清单（D8 · Phase A 必达）

| 表面 | 现状 | A 目标 |
|------|------|--------|
| `.app::before` aurora | 硬编码三色 rgba | `var(--aurora-a/b/c)` + 可 `opacity`；`aurora:false` 时 `display:none` 或透明 |
| `.composer-dock::before` | 硬编码三色 | 同上或 `--composer-glow-*` 派生自 aurora |
| `.glass-card` / `.glass-beam` | 已部分 `--beam-*` | 统一只吃 `--beam-a/b/c`；去掉残余硬编码色相 |
| `.liquid-glass::before` | 白/黑高光动画 | 高光可用中性白；**色相边**若有必须用 beam/ember，禁止写死青绿紫 |

基线在 `tokens.css` 增加（若缺）：

```css
--aurora-a: …; /* 与当前 rgba 青绿等价的 token */
--aurora-b: …;
--aurora-c: …;
/* --beam-a/b/c 已存在 */
```

皮肤 `tokens` 可覆盖 beam/aurora，暖皮肤一并换光边。

---

## 6. 合同

### 6.1 AppearanceState（v1）

```ts
export type AppearanceMode = 'dark' | 'light' | 'system'

export interface AppearanceState {
  version: 1
  mode: AppearanceMode
  skinId: string
  overlay: number  // 0–1
  blurPx: number
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  version: 1,
  mode: 'dark',
  skinId: 'default',
  overlay: 0,
  blurPx: 0,
}
```

### 6.2 SkinDefinition 与白名单（修订 · F3）

```ts
export interface SkinDefinition {
  id: string
  name: string
  preview: string
  /** 主配色对应的模式；设置点选时同步应用。 */
  preferredScheme: 'dark' | 'light'
  material?: 'glass' | 'paper'
  backgroundImage: string | null
  tokens: Partial<Record<AppearanceTokenName, string>>
  alternateTokens?: Partial<Record<AppearanceTokenName, string>>
  effects?: { overlay?: number; blurPx?: number; aurora?: boolean }
}
```

**AppearanceTokenName 白名单（Phase A · 仅「原语」· D13）**

皮肤 **可以** patch 的键（字面量色 / 独立语义）：

| 组 | 键 |
|----|-----|
| 表面（玻璃 · Lumen 壳） | `--canvas`, `--paper`, `--paper-solid`, `--paper-deep`, `--vellum`, `--card`, `--sand`, `--sand-deep`, `--scrim` |
| 表面（实色伴生 · Kumo Solid 槽 · R4） | `--surface-canvas`, `--surface-base`, `--surface-elevated`, `--surface-recessed`, `--surface-control`, `--surface-fill`, `--surface-fill-hover`, `--surface-interact` |
| 墨 | `--ink`, `--ink-soft`, `--ink-mute`, `--ink-faint`, `--ink-on-accent` |
| 强调原语 | `--ember`, `--ember-soft`, `--ember-tint`, `--moss`, `--moss-tint`, `--indigo`, `--indigo-tint` |
| 语义原语（字面量） | `--warning`, `--warning-bg`, `--danger`, `--danger-bg`, `--danger-line`, `--focus-ring` |
| 光边/氛围 | `--beam-a`, `--beam-b`, `--beam-c`, `--aurora-a`, `--aurora-b`, `--aurora-c` |
| 材质/阴影 | `--material-blur`, `--material-saturation`, `--material-highlight`, `--material-edge`, `--shadow-1/2/3`, `--skin-overlay-rgb` |
| 代码原语（字面量） | `--code-string`, `--code-type`, `--code-attr` |

未知键 / 别名键：resolve **丢弃**。
**不**把 `--color-kumo-*` 放进皮肤白名单（由桥自动跟随）。

#### 6.2.1 Token 别名表（R3 · 写死 · 不可被皮肤单独 patch）

以下在 `tokens.css` 基线中为 **`var(--原语)`**，成功色永远跟 moss、keyword 永远跟 ember 等。
**设计意图：别名不是第二套可调色，是语义别名。** 皮肤改原语 → CSS 级联自动更新别名。

| 别名（禁入白名单） | 基线定义 | 跟随原语 |
|--------------------|----------|----------|
| `--success` | `var(--moss)` | `--moss` |
| `--success-bg` | `var(--moss-tint)` | `--moss-tint` |
| `--code-keyword` | `var(--ember)` | `--ember` |
| `--code-number` | `var(--warning)` | `--warning` |
| `--code-title` | `var(--indigo)` | `--indigo` |

**实现纪律**

1. `baseline` 输出必须保留上表别名 → `var(--原语)`，**禁止** resolve 把别名展开成烘焙色再 setProperty（否则丢级联）。
2. 皮肤 `tokens` 若含别名键 → **丢弃**（与未知键相同）。
3. 若未来要「success 独立于 moss」→ 先改 tokens 基线为字面量，再把该键移入白名单；不得静默双义。
4. `check:theme`（D7）：Kumo 颜色合同变量须匹配引用；**无 Lumen 对应**的键进 **literalAllowlist**（badge 等），**不得**因强制引用阻断 kumo 升级。

#### 6.2.2 明暗与材质

- 推荐模式决定主配色归属；点选皮肤同时保存 skinId 和推荐 mode，用户也可手动切明暗或跟随系统。
- resolve 按实际明暗使用主 tokens 或 alternateTokens，不把暗色皮肤的浅文字混进 light 基线；缺少另一模式补丁时使用对应基线。
- glass 使用半透面、背景模糊、反光边缘和轻阴影；paper 使用实底、禁玻璃扫光/彩边与 backdrop blur。
- 浅色皮肤的 ink-on-accent 为白，主强调用深色；Kumo 控件和文档岛使用 surface-* 实色，透明度只用于壳面。
- 背景遮罩浅色用白、深色用黑；blurPx 只模糊背景氛围层，正文不参与 filter。

### 6.3 ResolvedTheme

```ts
export interface ResolvedTheme {
  colorScheme: 'dark' | 'light'
  appearanceIntent: 'dark' | 'light'
  skinId: string
  material: 'glass' | 'paper'
  tokens: Record<string, string>  // 白名单全集（基线⊕补丁）
  backgroundImage: string | null
  overlay: number
  blurPx: number
  aurora: boolean
}
```

**resolve 规则**

1. system 模式由媒体查询提供实际明暗，否则取用户明确的 mode。
2. 未知 skinId 回退 default，材质缺省 glass。
3. 先选 LIGHT_BASELINE/DARK_BASELINE；明暗匹配 preferredScheme 时合并主 tokens，否则合并 alternateTokens 或空补丁。
4. 仅允许白名单原语，别名保持 var(--原语)；surface-canvas 始终引用 canvas。
5. overlay/blurPx 使用归一后的用户值；aurora 使用皮肤效果定义。

### 6.4 applyTheme 合同

- data-theme=celadon 恒驻；data-skin/data-material/data-appearance 与解析结果同步。
- style.colorScheme 使用真实解析明暗，Tauri set_window_theme 同步本窗口标题栏，不修改系统偏好。
- 清理上一轮 token 后再写完整基线与补丁；不直接写任何 --color-kumo-*。
- 设置背景图片、遮罩与模糊；material token 由样式层消费，正文不叠玻璃扫光。

**Widget 内容岛边界**

hostChromeIsDark 仍优先读取真实 color-scheme，缺失时依据 canvas 亮度。暗壳使用固定 LIGHT_DOC_VARS；浅壳镜像深 ink 与不透明 surface-elevated/base/recessed。receiver 继续保持 color-scheme: only light，玻璃 alpha 不进入文档背景。

### 6.5 持久化

| 键 | 说明 |
|----|------|
| `lumen:appearance.v1` | AppearanceState JSON；坏数据 → DEFAULT |

**多窗口**：同 origin WKWebView 共享 localStorage（外部审计 F 确认）；A 不强制 `~/.lumen` 文件。

### 6.6 设置 IA

```text
模型 | 研究偏好 | 研究预算 | 外观
```

偏好：mode · 皮肤网格 · overlay · blur。

---

## 7. 分期

| Phase | 交付 | 必含改造 |
|-------|------|----------|
| **A** | 偏好 UI + 3–6 内置皮肤 + 持久化 + **D7/D15 Kumo 桥（含实色伴生）** + **D8 装饰变量化** | `tokens` 增 `--surface-*`、theme-celadon 桥、check solidSlot、styles 装饰面 |
| **B** | 本地上传背景 + library | 文件存储 |
| **C** | ZIP + tokens.json 白名单校验 | 自有 manifest |
| **D（已实现）** | 真实浅色 baseline、玻璃/纸面材质 | 全 UI 深墨 + light Kumo 桥 + 原生标题栏 + 实色内容岛 |

---

## 8. 非目标

- CDP / 注入闭源客户端
- 业务组件 skin 分支
- 外观写入模型 settings
- Phase A 任意用户 CSS
- DreamSkin ZIP 兼容
- 自定义布局或任意用户 CSS
- 换肤 remount messages
- Phase A 让 widget 内容岛跟随暗壳皮肤（D11）
- F1 方案 (b)：JS 枚举 apply 全部 Kumo 变量（除非 (a) 被证伪）

---

## 9. 验收 AT（修订）

| ID | 预期 |
|----|------|
| AT1 | 设置有「偏好」 |
| AT2a | 切换皮肤后 **Lumen token 驱动区**（侧栏/气泡/强调）≤1 帧变化 |
| AT2b | 切换皮肤后：设置页 **Kumo 主按钮** computed 背景与 `--ember` 同色相族；**Dialog/菜单面**与 `--surface-elevated`（非 `--card`）一致；采样 `backgroundColor` 的 **alpha ≥ 0.9**（R4，防透明泄漏） |
| AT2c | 背景图：token 即时；**图片可在 load 后**显示（不得要求 webp 同步 1 帧） |
| AT3 | 重启保持 state |
| AT4 | resolve 单测：非法 skinId → default；白名单过滤；**别名键被丢弃**；baseline 中 `--success` 仍为 `var(--moss)` |
| AT5 | `components/` 下无业务 `skinId===`（允许 appearance/、PreferencePane） |
| AT6 | 不调用模型 `updateSettings` |
| AT7 | 默认 overlay 下正文可读；暖皮肤下 beam/aurora 非残留青绿（目视） |
| AT8 | 换肤不 remount messages 根 |
| AT9 | `default` 皮肤：Lumen 壳观感 ≥ 当前 Glass；**Kumo 控件底不透明感与改桥前一致**（目视 + AT2b alpha） |
| AT9b | `default` 下 `--surface-*` 伴生值与改前 `theme-celadon` 字面量一致（单测字符串或 computed） |
| AT10 | `npm run check:theme`：名齐全 + 引用链；literalAllowlist；**solidSlotList 不得引用玻璃半透明族**（R4） |
| AT11 | mode=light/dark/system 输出真实明暗基线，宿主 color-scheme 与解析结果一致；原生标题栏同步 |
| AT12 | 暗壳内容岛走 LIGHT_DOC_VARS；浅玻璃内容岛使用 surface-* 实色浅底与深 ink，不继承半透明 paper/card |
| AT13 | 新三套浅色预设使用 light 基线，glass 半透/模糊/反光，paper 实底/无光边；深浅往返无 token 残留 |

**E2E（人）**：三皮肤切换含设置内 Kumo 按钮；重启；进行中会话换肤。

---

## 10. 实现锚点

| 角色 | 路径 | 状态 |
|------|------|------|
| appearance/* | `src/appearance/` | 明暗解析、材质、持久化与原生同步已实现 |
| 偏好 UI | `mastra/views/chrome/Appearance.tsx` + `Settings.tsx` | 点选皮肤同步推荐明暗；研究中仍可打开并切换 |
| Kumo 桥 | `theme-celadon.css` | 同源 token 与实色伴生映射 |
| check:theme | `scripts/check-theme-celadon.mjs` | 名称、引用链与实色槽验证 |
| 装饰面 | `styles.css` + `tokens.css` | 明暗遮罩、材质反光/阴影、背景模糊与纸面无装饰 |
| 本文 | `doc/appearance-skin.md` | 现行合同；§12–§17 保留早期评审历史 |

---

## 11. 早期开放问题（历史；明暗现行合同以 §6 为准）

- [x] **Q1** Phase A light：诚实回退 dark token + **不改宿主 color-scheme**（R1/R2 默认采纳；Phase D 再真 light）
- [ ] **Q2** 内置皮肤：CSS 渐变占位 vs 仓库 webp（体积）？
- [ ] **Q3** `blurPx` 默认 0？
- [ ] **Q4** 上传严格 Phase B？
- [x] **Q5** 多窗口 localStorage → **关闭**（同 origin 已共享）
- [x] **Q6 · F1** 采纳 **(a) CSS 引用桥**（默认）
- [x] **Q7** 代码：原语可随皮肤；**别名 keyword/number/title 跟 ember/warning/indigo**（§6.2.1）；string/type/attr 可独立 patch
- [ ] **Q8** badge 多色 Kumo 键：literalAllowlist 字面量中性（默认）？
- [x] **Q9 · R1** D12 禁止 light 写宿主 color-scheme（已写入 §6.4）
- [x] **Q10 · R3** 原语/别名边界（已写入 §6.2.1）
- [x] **Q11 · R4** Solid 伴生 token + 桥禁玻璃半透明（§5.4.1 / D15）
- [x] **Q12 · R5** `--canvas` ↔ `--surface-canvas` 合同恒等（§5.4.1）
- [x] **Q13 · R6** 桥可引 `--success` 别名；皮肤仍不可 patch（§5.4.2）
- [x] **Q14 · R7** 白名单必须含全部 `--surface-*`；与 solidSlot 同检（check 合同）

---

## 12. 早期评审检查清单（历史）

1. 问题可测？
2. §2 可复验？含 Kumo 字面量与多装饰面？
3. 外部调研未虚标 V1？
4. F1 是否闭合（桥方案可实施）？
5. 数据流是否含 Kumo？
6. 与模型设置隔离？
7. 白名单是否含 beam/aurora/code？
8. Phase A 范围是否含 D7+D8？
9. AT2 是否拆 token/Kumo/背景图？
10. 非目标是否挡住 CDP/任意 CSS/(b) 双真源？
11. 是否误称已实现？
12. **R1**：apply 是否禁止 light 宿主 color-scheme？AT11/AT12 是否可验？
13. **R2**：预置皮肤是否全 dark preferredScheme？
14. **R3**：别名表与白名单是否互斥、baseline 是否保留 var()？
15. **R4**：Solid 槽是否禁玻璃 token？伴生 `--surface-*` 与 AT9/AT2b alpha？
16. **R5–R7**：canvas 恒等、桥引别名注释、白名单含 surface 完备性？

---

## 13. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-08-12 | 初版提案 |
| 2026-08-12 | **吸收外部源码审计 F1–F9**；附录 §14 |
| 2026-08-12 | **二轮 R1–R3**；附录 §15 |
| 2026-08-12 | **四轮 R4**：玻璃/实色分槽、`--surface-*`、AT9b；附录 §16；可实现评审 |
| 2026-08-12 | **五轮 R5–R7**：canvas↔surface-canvas 恒等；桥引 success 别名注释；check 白名单完备；附录 §17 |

---

## 14. 外部审计响应（源码对照 · 正式附录）

审计方：独立 AI；方法：读 SPEC + `tokens.css` / `theme-celadon.css` / `check-theme-celadon.mjs` / `styles.css` / `themeVars.ts` / Settings。
本仓复核：F1/F2/F4/F7 **V2 成立**。

| ID | 严重度 | 摘要 | 本仓复核 | **决议** |
|----|--------|------|----------|----------|
| **F1** | 红 | Kumo 字面量，换肤不进控件 | `theme-celadon.css` 全为 `light-dark(#…)`；check 只校名 | **采纳 (a)**：改引用链 + check 升级。**拒绝 (b)** 默认 |
| **F2** | 橙 | 装饰硬编码面多于 `.app` | composer-dock / glass / liquid-glass 确认 | **Phase A 必达** §5.5 清单 |
| **F3** | 黄 | 白名单过窄 | 缺 paper-deep/code/beam 等 | **扩白名单** §6.2 |
| **F4** | 黄 | `data-theme` 与 skin 关系未定 | 映射挂 `[data-theme=celadon]` | **`data-theme=celadon` 恒驻**；skin 另锚（D4/D7） |
| **F5** | 黄 | preferredScheme 无行为 | 属 SPEC 洞 | **仅 UI 提示，resolve 忽略**（D10） |
| **F6** | 白 | token 计数 | 二轮更正：69 行首声明、5 处 var 别名；「100」为误计 | **精确写 69**；收回「约」 |
| **F7** | 白 | Widget 不跟暗壳 token | `hostChromeIsDark` → LIGHT_DOC_VARS | **A 保持有意解耦**（D11） |
| **F8** | 白 | AT2「1 帧」对 webp 过严 | 合理 | **AT2a/b/c 拆分** |
| **F9** | 白 | color-scheme 合同 | 见 **R1**：不可简单写 light | **D12 修订**（§15） |
| 多窗口 Q5 | — | localStorage 已共享 | 同意 | **关闭** |

### 14.1 为什么 F1 选 (a) 不选 (b)

| | (a) CSS 桥 | (b) JS 枚举 Kumo |
|--|------------|------------------|
| 真源 | 皮肤只碰 Lumen token | 皮肤或 apply 双份 Kumo |
| check:theme | `scripts/check-theme-celadon.mjs` | 名称、引用链与实色槽验证 |
| 皮肤作者 | 只懂 Lumen 语义 | 要懂 Kumo 合同 |
| 升级 kumo | 映射表加行 | apply 列表加行 |

(a) 与 VS Code「semantic → 实际」同构；(b) 是补丁机器。

### 14.2 残余风险（实现时）

1. Kumo 桥优先 `var(--x)` 单值（A 全 dark）；`light-dark` 留 Phase D。
2. check:theme：**literalAllowlist** 承接无 Lumen 语义的新 Kumo 色键（§5.4 / R3）。
3. liquid-glass 中性高光与彩色 beam 分离——设计抽查。

---

## 15. 二轮审计响应（R1–R3）

审计方：同一外部 AI 复审修订 SPEC + 源码。
本仓复核：**R1/R3 V2 成立**；R2 为产品/合同补全（采纳）。

| ID | 摘要 | 复核 | **决议** |
|----|------|------|----------|
| **R1** | `style.colorScheme=light` 使 `hostChromeIsDark`→false，widget 丢浅色岛 | `themeVars.ts` L33–41 优先 color-scheme | **D12 重写**：Phase A 宿主 **固定 dark**；mode light 不写宿主 scheme；AT11/AT12 |
| **R2** | preferredScheme 与 dark 回退冲突 → 空头角标 | 合同洞 | **D14 / §6.2.2**：A 预置全 dark；角标与真实基线一致 |
| **R3** | 跨 token `var()` 别名 vs 白名单歧义 | tokens 中 success/code-* 等 5 别名 | **D13 / §6.2.1**：原语可 patch、别名禁 patch、baseline 保留 `var()` |
| F6 更正 | 69 声明 / 5 别名 | 同意 | 正文改精确 |

### 15.1 R1 因果（实现者勿再踩）

```text
apply 写 color-scheme:light
  → hostChromeIsDark() === false
  → collectThemeVars 走「浅壳镜像宿主 token」
  → 不再返回 LIGHT_DOC_VARS
  → 内容岛被当成浅壳整页换肤  ≠  D11「固定浅色文档岛」
```

### 15.2 别名不是「递归爆炸」

CSS `var(--success)` → `var(--moss)` 是**有意一层别名**，不是 apply 循环 setProperty。
风险仅在于：**白名单若允许 patch `--success` 为字面量**，会切断与 moss 的同步。故别名禁入白名单。

---

## 16. 四轮审计响应（R4 · 透明度）

审计方：外部 AI；结论：R1–R3 已闭环，可进实现评审；**新风险 R4**。
本仓复核：Lumen `--paper/--card/--vellum` 为半透明 rgba；Kumo 对应槽今日为**实色 hex**（V2）→ 1:1 `var()` **会改 default 控件不透明度**，与 AT9 冲突。

| ID | 摘要 | **决议** |
|----|------|----------|
| **R4** | 玻璃 token 1:1 桥到 Kumo 实色槽 → 半透明泄漏 | **D15 / §5.4.1**：Solid 伴生 `--surface-*`；桥 solid 槽只引伴生；禁 vellum→fill；AT2b alpha≥0.9；AT9b 伴生=旧字面量 |

### 16.1 为什么不靠 color-mix「挤实」

半透明色与 canvas mix **不能**在任意叠层下得到与今日 Kumo 控件一致的不透明色，且难单测。
**显式实色伴生 + default 对齐旧 hex** 是 AT9 的唯一稳妥路径。

### 16.2 皮肤作者指引（预置）

| 意图 | 应 patch |
|------|----------|
| 聊天区玻璃氛围 | `--card` / `--paper` / aurora / beam |
| Kumo 按钮/菜单实色面 | **成对** `--surface-elevated` / `--surface-fill` / … |
| 品牌色 | `--ember`（桥到 kumo-brand，实色） |
| 成功语义色 | **`--moss`**（勿 patch `--success`；桥经 success 别名跟随） |
| 画布 | **`--canvas`**（R5：surface-canvas 跟随或成对同步） |

当前内置皮肤：浅色 `glacier-glass` 冰川液体玻璃、`warm-paper` 暖白纸面、`sea-salt` 海盐浅青玻璃；暗色 `default` 青瓷默认、`cosmic-latte` 宇宙拿铁、`mist-forest` 雾林深境、`clear-sky` 晴穹蓝构、`clay-warm` 陶土叠影、`ink-plum` 墨紫夜航、`deep-tide` 玄青海潮、`wine-dusk` 酒红暮光。设置点选即时应用并写入本机偏好；前期全 dark 限制已由 §6 的真实明暗合同取代。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

---

## 17. 五轮审计响应（R5–R7 · 文档打磨）

审计方：外部 AI；结论：R4 已干净闭环，**可进入实现评审**；R5–R7 不阻塞编码。
本仓决议：**全部采纳**，并入正文。

| ID | 摘要 | **决议** |
|----|------|----------|
| **R5** | `surface-canvas` vs `canvas` 偶合等价 | **合同恒等**；桥只引 `surface-canvas`；变更须同步（§5.4.1） |
| **R6** | 桥表示例出现 `--success` 别名易误解 | 注：**桥可引、皮肤不可 patch**（§5.4.2） |
| **R7** | surface 进白名单与 solidSlot 双规则 | check：**白名单必须含全部 `--surface-*`**；与 Phase C 共用常量 |

**实现评审放行条件（审计共识）**：F1→R4 合同闭环 + AT 可验；R5–R7 为防漂移注释；Q2/Q3/Q4/Q8 产品决策不挡 DEV。

---

## 附录 A · 反模式

| 反模式 | 后果 |
|--------|------|
| 只 patch `--ember` 不改 Kumo 桥 | 半套皮肤（F1） |
| 只变量化 `.app::before` | 输入岛仍青瓷光（F2） |
| 皮肤白名单含 `--color-kumo-*` | 双真源、绕过桥 |
| 去掉 `data-theme=celadon` | Kumo 映射整块失效 |
| `key={skinId}` 挂 messages | 丢滚动与进行中态 |
| **`documentElement.colorScheme='light'`（A）** | **砸 widget 岛（R1）** |
| **皮肤 patch `--success` 字面量** | **切断 moss 别名（R3）** |
| **预置 light 角标 + dark 基线** | **空头 UI（R2）** |
| **`kumo-fill: var(--vellum)` 等玻璃→实色槽** | **控件变透、AT9 挂（R4）** |
| **只改 `--canvas` 不改/不同步 surface-canvas** | **壳底与 Kumo 画布漂移（R5）** |
| **误以为桥里的 `--success` 可皮肤 patch** | **静默丢弃或双义（R6）** |

## 附录 B · 参考

- Codex-Dream-Skin: https://github.com/Fei-Away/Codex-Dream-Skin
- `packages/ui-client/src/tokens.css`, `theme-celadon.css`, `styles.css`, `components/widget/themeVars.ts`
- `packages/ui-client/scripts/check-theme-celadon.mjs`
- HDD: `.claude/skills/hdd/SKILL.md`
