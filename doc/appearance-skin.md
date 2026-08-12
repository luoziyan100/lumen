# 外观偏好与皮肤（Appearance / Skin）

状态: **提案 · 修订中（吸收外部审计 F1–F9）**（2026-08-12）  
类型: 产品 + 工程架构合同（**尚未实现**）  
作者会话: Lumen UI；外部 AI 源码对照审计已并入 §14  
对照实现分支: `experiment/glass-ui`（现状为单暗色 Glass Beam）

> 目标：在设置中增加「偏好 / 皮肤」能力，工程上解耦、可测、可演进；  
> **不**引入对第三方闭源客户端的 CDP 注入方案。  
> **换肤必须传导到 Lumen token 层与 Kumo 控件层**，禁止「自定义区变了、Button/Dialog 仍是旧青瓷」。

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

## 2. 现状（Lumen · 可复验 · 2026-08-12）

| 项 | 事实 | 路径 | 级 |
|----|------|------|-----|
| 主题挂载 | `html data-theme="celadon"` 写死 | `index.html` | V2 |
| Lumen token | `:root` 暗色变量；**声明约 69 条** `--name:`（审计称「约 100」若计重复/别名需注明口径；以 `grep '^\s*--[a-z].*:' tokens.css` 为准） | `tokens.css` | V2 |
| Beam 色 | 已有 `--beam-a/b/c` | `tokens.css` L96–98 | V2 |
| Kumo 映射 | **字面量烘焙**，非 `var(--canvas)` | `theme-celadon.css` L14–85，`[data-theme="celadon"]` | V2 |
| check:theme | 只校验 **变量名齐全**，不校值/引用链 | `scripts/check-theme-celadon.mjs` | V2 |
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
| H4 | 浅色与暗色同等优先 | ❌ 不作 A 必达 |
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
| **D10 · F5** | `preferredScheme` **仅 UI 提示**（缩略图角标）；**不参与** resolve 合并。Mode 唯一决定 `colorScheme` |
| **D11 · F7** | Widget 内容岛 Phase A **保持**暗壳固定浅色文档变量（有意解耦）；SPEC 不得再写「widget 跟皮肤」。若未来要跟，另开 Phase |
| **D12 · F9** | `applyTheme` 必须设置 `document.documentElement.style.colorScheme`（及必要时 `color-scheme` CSS）与 `ResolvedTheme.colorScheme` 一致 |

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
PreferencePane → store → resolveTheme(state)
                              │
                              ▼
                       applyTheme(resolved)
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
  data-appearance      Lumen CSS vars        --skin-bg-* / overlay / blur
  data-skin            (--canvas, --ember,   color-scheme
  data-theme=celadon   --beam-*, --aurora-*)
  (恒驻)                      │
                              ▼
              theme-celadon.css 桥：
              --color-kumo-brand: var(--ember);
              --color-kumo-canvas: var(--canvas);
              …（映射表 §5.4）
                              │
                              ▼
              Kumo Button / Dialog / Select / Tooltip / Toasty
```

**禁止**第二条 `apply` 路径在业务组件里写 Kumo 变量。

### 5.4 Kumo 桥映射表（D7 · 合同）

原则：Kumo 变量 **只**通过 CSS 引用 Lumen 语义 token；皮肤只 patch Lumen 侧。

| Kumo 变量（节选） | 引用（提案） |
|-------------------|--------------|
| `--color-kumo-canvas` | `var(--canvas)` |
| `--color-kumo-base` | `var(--paper-solid)` |
| `--color-kumo-elevated` | `var(--card)` |
| `--color-kumo-recessed` | `var(--paper-deep)` |
| `--color-kumo-contrast` | `var(--ink)` |
| `--color-kumo-control` | `var(--paper)` |
| `--color-kumo-fill` | `var(--vellum)` 或派生 |
| `--color-kumo-hairline` / `line` | `var(--sand)` / `var(--sand-deep)` |
| `--color-kumo-focus` | `var(--focus-ring)` |
| `--color-kumo-brand` | `var(--ember)` |
| `--color-kumo-brand-hover` | `var(--ember-soft)` |
| `--color-kumo-danger` 等语义 | `var(--danger)` / `--warning` / `--success` / `--indigo` |
| `--color-kumo-overlay` | `var(--scrim)` |
| `--text-color-kumo-default` | `var(--ink)` |
| `--text-color-kumo-subtle` | `var(--ink-mute)` |
| `--text-color-kumo-brand` | `var(--ember-soft)` |
| … | 完整表实现时在 `theme-celadon.css` 注释「桥」区块列出；`check:theme` 校验每个颜色合同变量的值匹配 `/var\(--[a-z0-9-]+\)/`（允许 `light-dark(var(--x), var(--x))`） |

**不采纳 F1-(b)**（JS 枚举全部 Kumo 键 apply）：双份真源、与 check:theme 名校验脱节、皮肤作者要懂 Kumo 合同。

**例外**：badge 多色系若无 Lumen 语义对应，可继续字面量或映射到固定中性，**不得**阻挡 brand/canvas/text 主路径。

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
  overlay: 0.42,
  blurPx: 0,
}
```

### 6.2 SkinDefinition 与白名单（修订 · F3）

```ts
export interface SkinDefinition {
  id: string
  name: string
  preview: string
  /** 仅 UI：缩略图建议配色角标；resolve 忽略（D10） */
  preferredScheme: 'dark' | 'light'
  backgroundImage: string | null
  tokens: Partial<Record<AppearanceTokenName, string>>
  effects?: { overlay?: number; blurPx?: number; aurora?: boolean }
}
```

**AppearanceTokenName 白名单（Phase A 锁定 · 可扩不可缩语义）**

| 组 | 键 |
|----|-----|
| 表面 | `--canvas`, `--paper`, `--paper-solid`, `--paper-deep`, `--vellum`, `--card`, `--sand`, `--sand-deep`, `--scrim` |
| 墨 | `--ink`, `--ink-soft`, `--ink-mute`, `--ink-faint` |
| 强调/语义 | `--ember`, `--ember-soft`, `--ember-tint`, `--moss`, `--moss-tint`, `--indigo`, `--indigo-tint`, `--success`, `--success-bg`, `--warning`, `--warning-bg`, `--danger`, `--danger-bg`, `--danger-line`, `--focus-ring` |
| 光边/氛围 | `--beam-a`, `--beam-b`, `--beam-c`, `--aurora-a`, `--aurora-b`, `--aurora-c` |
| 代码 | `--code-keyword`, `--code-string`, `--code-number`, `--code-title`, `--code-type`, `--code-attr` |

未知键：resolve **丢弃** + `console.debug`。  
**不**把 `--color-kumo-*` 放进皮肤白名单（由桥自动跟随）。

### 6.3 ResolvedTheme

```ts
export interface ResolvedTheme {
  colorScheme: 'dark' | 'light'
  skinId: string
  tokens: Record<string, string>  // 白名单全集（基线⊕补丁）
  backgroundImage: string | null
  overlay: number
  blurPx: number
  aurora: boolean
}
```

**resolve 规则**

1. `mode==='system'` → `matchMedia('(prefers-color-scheme: dark)')` → `colorScheme`。  
2. `skin = registry[skinId] ?? registry.default`。  
3. **`preferredScheme` 不参与计算**（D10）。  
4. `tokens = baseline(colorScheme) ⊕ filterWhitelist(skin.tokens)`。  
5. Phase A：无 light baseline → `colorScheme` 强制按 dark baseline 填 token，并 `resolved.colorScheme` 仍可报 light 供 `color-scheme` 实验——**推荐 A：light 模式整体回退 dark token + 日志**，避免半套。  
6. `overlay` / `blurPx`：`state` 若用户动过则用 state，否则 skin.effects，否则 DEFAULT。（实现可用「是否等于 DEFAULT」粗判；更严可用 `overrides` 位图，非 A 必达。）  
7. `aurora`：`skin.effects.aurora ?? (skinId === 'default')`。

### 6.4 applyTheme 合同

1. `document.documentElement.dataset.theme = 'celadon'`（恒驻）。  
2. `dataset.appearance = colorScheme`；`dataset.skin = skinId`。  
3. `document.documentElement.style.colorScheme = colorScheme`（F9）。  
4. 对 `tokens` 每项 `setProperty`。  
5. 设置 `--skin-bg-image`、`--skin-overlay`、`--skin-blur`（供 `.app` 层消费）。  
6. **不**直接 setProperty 任何 `--color-kumo-*`（由 CSS 桥完成）。  
7. 可选：保留 previous ResolvedTheme 引用供失败回滚（非 A 必达）。

### 6.5 持久化

| 键 | 说明 |
|----|------|
| `lumen:appearance.v1` | AppearanceState JSON；坏数据 → DEFAULT |

**多窗口**：同 origin WKWebView 共享 localStorage（外部审计 F 确认）；A 不强制 `~/.lumen` 文件。

### 6.6 设置 IA

```text
模型 | 提示词 | 偏好 | 常驻服务
```

偏好：mode · 皮肤网格 · overlay · blur。

---

## 7. 分期

| Phase | 交付 | 必含改造 |
|-------|------|----------|
| **A** | 偏好 UI + 3–6 内置皮肤 + 持久化 + **D7 Kumo 桥** + **D8 装饰变量化** | theme-celadon 引用链、check:theme 升级、styles 装饰面 |
| **B** | 本地上传背景 + library | 文件存储 |
| **C** | ZIP + tokens.json 白名单校验 | 自有 manifest |
| **D** | 浅色 baseline 认真打磨 | 全 UI 对比度 + light Kumo 桥 |

---

## 8. 非目标

- CDP / 注入闭源客户端  
- 业务组件 skin 分支  
- 外观写入模型 settings  
- Phase A 任意用户 CSS  
- DreamSkin ZIP 兼容  
- Phase A 完整浅色设计系统  
- 换肤 remount messages  
- Phase A 让 widget 内容岛跟随暗壳皮肤（D11）  
- F1 方案 (b)：JS 枚举 apply 全部 Kumo 变量（除非 (a) 被证伪）

---

## 9. 验收 AT（修订）

| ID | 预期 |
|----|------|
| AT1 | 设置有「偏好」 |
| AT2a | 切换皮肤后 **Lumen token 驱动区**（侧栏/气泡/强调）≤1 帧变化 |
| AT2b | 切换皮肤后 **Kumo Button 品牌色 / Dialog 表面**与 `--ember/--card` 一致（抽查设置页按钮） |
| AT2c | 背景图：token 即时；**图片可在 load 后**显示（不得要求 webp 同步 1 帧） |
| AT3 | 重启保持 state |
| AT4 | resolve 单测：非法 skinId → default；白名单过滤 |
| AT5 | `components/` 下无业务 `skinId===`（允许 appearance/、PreferencePane） |
| AT6 | 不调用模型 `updateSettings` |
| AT7 | 默认 overlay 下正文可读；暖皮肤下 beam/aurora 非残留青绿（目视） |
| AT8 | 换肤不 remount messages 根 |
| AT9 | `default` 皮肤观感 ≥ 当前 Glass 基线 |
| AT10 | `npm run check:theme` 通过 **名齐全 + 引用链**（D7） |
| AT11 | `document.documentElement.style.colorScheme` 与 resolved 一致 |
| AT12 | 暗壳下 widget 仍为浅色内容岛（D11 回归，防止误改） |

**E2E（人）**：三皮肤切换含设置内 Kumo 按钮；重启；进行中会话换肤。

---

## 10. 实现锚点

| 角色 | 路径 | 状态 |
|------|------|------|
| appearance/* | `src/appearance/` | 未建 |
| 偏好 UI | PreferencePane + SettingsModal | 未建 |
| Kumo 桥 | `theme-celadon.css` | **待改引用** |
| check:theme | `scripts/check-theme-celadon.mjs` | **待升级** |
| 装饰面 | `styles.css` + `tokens.css` aurora | **待变量化** |
| 本文 | `doc/appearance-skin.md` | 修订提案 |

---

## 11. 开放问题（含审计补项）

- [ ] **Q1** Phase A light：诚实回退 dark token？  
- [ ] **Q2** 内置皮肤：CSS 渐变占位 vs 仓库 webp（体积）？  
- [ ] **Q3** `blurPx` 默认 0？  
- [ ] **Q4** 上传严格 Phase B？  
- [ ] **Q5** ~~多窗口 localStorage~~ → **关闭**（审计：同 origin 已共享）  
- [ ] **Q6 · F1** 确认采纳 **(a) CSS 引用桥**（默认）还是否决改 (b)？  
- [ ] **Q7 · F3** 代码语法色是否必须随皮肤（默认是）？  
- [ ] **Q8** badge 多色 Kumo 键：保持字面量中性 或 逐个映射？  

---

## 12. 评审检查清单

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

---

## 13. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-08-12 | 初版提案 |
| 2026-08-12 | **吸收外部源码审计 F1–F9**：D7 Kumo 引用桥、D8 装饰面枚举、扩白名单、data-theme 恒驻、preferredScheme 语义、widget/AT/color-scheme 修正；附录 §14 |

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
| **F6** | 白 | token「约 69」口径 | `^\s*--.*:` 计 69；「100」需统一口径 | 正文改为 **约 69 条声明**；审计记录保留 |
| **F7** | 白 | Widget 不跟暗壳 token | `hostChromeIsDark` → LIGHT_DOC_VARS | **A 保持有意解耦**；改写 PT5 断言（D11） |
| **F8** | 白 | AT2「1 帧」对 webp 过严 | 合理 | **AT2a/b/c 拆分** |
| **F9** | 白 | 缺 color-scheme 合同 | `:root{color-scheme:dark}` | **apply 必写**（D12） |
| 多窗口 Q5 | — | localStorage 已共享 | 同意 | **关闭 Q5 担忧** |

### 14.1 为什么 F1 选 (a) 不选 (b)

| | (a) CSS 桥 | (b) JS 枚举 Kumo |
|--|------------|------------------|
| 真源 | 皮肤只碰 Lumen token | 皮肤或 apply 双份 Kumo |
| check:theme | 可验引用 | 名校验与运行时脱节 |
| 皮肤作者 | 只懂 Lumen 语义 | 要懂 Kumo 合同 |
| 升级 kumo | 映射表加行 | apply 列表加行 |

(a) 与 VS Code「semantic → 实际」同构；(b) 是补丁机器。

### 14.2 残余风险（实现时）

1. `light-dark(var(--x), var(--x))` 在部分引擎行为需实机测（A 以 dark 为主可先 `var(--x)` 单值）。  
2. Kumo 升级引入新颜色 token：check:theme 引用规则可能对「尚无 Lumen 对应」的键放行字面量——需在脚本中 **allowlist 字面量键**。  
3. liquid-glass 中性高光与彩色 beam 分离不当会显脏——需设计抽查。

---

## 附录 A · 反模式

| 反模式 | 后果 |
|--------|------|
| 只 patch `--ember` 不改 Kumo 桥 | 半套皮肤（F1） |
| 只变量化 `.app::before` | 输入岛仍青瓷光（F2） |
| 皮肤白名单含 `--color-kumo-*` | 双真源、绕过桥 |
| 去掉 `data-theme=celadon` | Kumo 映射整块失效 |
| `key={skinId}` 挂 messages | 丢滚动与进行中态 |

## 附录 B · 参考

- Codex-Dream-Skin: https://github.com/Fei-Away/Codex-Dream-Skin  
- `packages/ui-client/src/tokens.css`, `theme-celadon.css`, `styles.css`, `components/widget/themeVars.ts`  
- `packages/ui-client/scripts/check-theme-celadon.mjs`  
- HDD: `.claude/skills/hdd/skill` → `hdd/SKILL.md`  
