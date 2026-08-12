# 外观偏好与皮肤（Appearance / Skin）

状态: **提案 · 待评审**（2026-08-12）  
类型: 产品 + 工程架构合同（**尚未实现**）  
作者会话: Lumen UI 工程讨论；供独立 AI / 人审审计  
对照实现分支: `experiment/glass-ui`（现状为单暗色 Glass Beam）

> 目标：在设置中增加「偏好 / 皮肤」能力，工程上解耦、可测、可演进；  
> **不**引入对第三方闭源客户端的 CDP 注入方案。

---

## 0. 审计说明（给评审方）

本文档按 **可证伪 / 可追溯** 写就。评审时请分别判定：

| 章节 | 应判定的内容 | 通过标准 |
|------|----------------|----------|
| §1 问题 | 需求是否真实、边界是否清楚 | 问题陈述无可观察歧义 |
| §2 现状 | 对仓库事实是否准确 | 可对照路径复验，不依赖「据说」 |
| §3 外部调研 | 类比是否标清等级（非 Lumen 源码） | 每条有来源；未宣称已读闭源实现 |
| §4 HDD | 假设是否可证伪；证据等级是否诚实 | 事前规划未伪装成 V1 现场复现 |
| §5 决策 | 架构是否解耦；是否有耦合反模式 | 换肤不要求改业务组件 |
| §6 合同 | 类型 / 存储 / 应用管道是否可测 | 有单测锚点与 AT 表 |
| §7 分期 | 爆炸半径是否可控 | Phase A 可独立交付 |
| §8 非目标 | 是否明确拒绝高风险项 | CDP / 任意 CSS 等已排除 |
| §9 开放问题 | 是否阻塞 DEV | 评审需勾选或改写 |

**证据等级约定**（与项目 HDD skill 一致）：

| 级 | 含义 |
|----|------|
| V1 | 受控复现 |
| V2 | 本仓库/本机痕迹闭合 |
| V3 | 部分闭合 |
| V4 | 外部产品/文档类比 |
| V5 | 纯推理（**不得单独支撑决策**） |

文中凡写「业界做法」默认 **≤V4**，除非另注。

---

## 1. 问题

### 1.1 用户意图

- 在 **设置** 中增加类似 ChatGPT/Codex 偏好里的 **外观 / 图片主题** 能力。
- 参考形态：主题卡网格、浅/深/跟随系统、模糊/遮罩、（后续）上传自定义图。
- 外部参考仓库：[Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)（Codex 桌面端**外部**换肤工具）。

### 1.2 工程约束（第一性）

| 约束 | 说明 |
|------|------|
| 自有宿主 | Lumen 拥有 UI 源码与 WebView，**不需要** CDP 注入闭源壳 |
| 已有 token | 组件主要消费 CSS 变量（`tokens.css`），换肤应扩展此路径 |
| 解耦 | 业务组件（Composer / Sidebar / 消息列）**不得**出现 `if (skinId === …)` |
| 隔离 | 外观偏好与模型 API Key / profile **不得**混存、混 API |
| 可读性 | 任意壁纸不得牺牲正文对比度（遮罩 / 模糊为产品能力，非装饰可选项） |

### 1.3 成功定义（产品）

用户可在设置「偏好」中选择内置皮肤；主界面氛围（背景 / 强调色）即时变化；重启后保持。  
**不要求** Phase A 即支持社区主题市场或任意用户 CSS。

---

## 2. 现状（Lumen · 可复验）

以下基于 `packages/ui-client` 静态核查（审计日 2026-08-12，分支以工作区为准）。

| 项 | 事实 | 路径 / 锚点 | 证据级 |
|----|------|-------------|--------|
| 主题挂载 | `<html data-theme="celadon">` 写死 | `packages/ui-client/index.html` | V2 |
| 设计 token | `:root` 暗色 Glass 变量（约 69 个 `--*`） | `src/tokens.css` | V2 |
| Kumo 映射 | `theme-celadon.css` + `check:theme` 脚本 | `src/theme-celadon.css`，`scripts/check-theme-celadon.mjs` | V2 |
| 画布装饰 | `.app` 背景 `--canvas`；`::before` aurora **硬编码 rgba 渐变** | `src/styles.css`（`.app` 段） | V2 |
| 设置导航 | 仅 `model \| prompt \| service` | `SettingsModal.tsx` `type Pane` | V2 |
| 外观状态 | **无** `appearance` / `skin` 持久化合同 | 设置与 App localStorage 键扫描 | V2 |
| Widget 主题 | 从宿主读 CSS 变量注入 iframe | `components/widget/themeVars.ts` | V2 |

**推论（V5→仅作风险，不单独立项）**：换肤若只改一张背景图而不动 aurora 硬编码与 token，会出现「旧光晕透出」；Phase A 必须处理装饰层变量化或按 `data-skin` 关闭默认 aurora。

---

## 3. 外部调研（类比 · ≤V4）

### 3.1 Codex-Dream-Skin（开源，可读合同）

来源：仓库 README / AGENTS.md / docs/PROJECT.md（2026 公开文档）。

| 点 | 内容 | 对 Lumen 的启示 |
|----|------|-----------------|
| 形态 | **独立 App**，CDP 注入官方 Codex，**不改** asar/签名 | Lumen **不采用** CDP；学合同不学管道 |
| 主题包 | `theme.json` + 背景图 + `theme.css`；Studio 另有 manifest/SHA | 后置 Phase 可学 **包契约 + fail-closed** |
| Safe CSS | 仅允许登记部件；导入与应用双检 | 若将来允许自定义 CSS，必须白名单 |
| 导入≠启用 | 导入进库，用户显式选择才应用 | **Library vs Active** 分离 |
| 配置隔离 | 换肤不静默改 API Base/Key | 与 Lumen「模型设置」硬隔离 |
| 回滚 | 应用失败恢复 last-known-good | Apply 层可保留 previous ResolvedTheme |

### 3.2 VS Code 主题模型（业界通识 · V4）

- 主题 = **数据包**（色表 / token 映射），不是改工作台组件源码。
- 扩展贡献主题；核心通过 semantic token → 实际颜色。
- 用户设置只选 `workbench.colorTheme` 与有限 overrides。

**可迁移原则**：皮肤 = 数据；运行时 = 解析 + 应用；UI 壳无皮肤分支。

### 3.3 ChatGPT 类「偏好 / 图片主题」（产品形态 · V4）

公开帮助/设置描述量级：Appearance 独立分区；base theme（system/dark/light）；桌面端另有 accent / background 等（具体字段随版本变，**不绑死字段名**）。

截图级产品能力（用户提供 UI 参考，非 Lumen 实现）：

- 外观模式：浅 / 深 / 跟随系统  
- 图片主题网格 + 选中态  
- 模糊 / 覆盖色  
- 上传自定义（后置）

### 3.4 调研结论表

| 学 | 不学 |
|----|------|
| 主题数据包 / registry | CDP 注入自有 App |
| State → Resolve → Apply | 组件内 skin 分支 |
| 导入库 ≠ 当前启用 | 与 API 配置耦合 |
| Safe 边界、fail-closed | 任意用户 CSS 无校验 |
| 壁纸 + 遮罩保对比度 | 一次做完社区市场 |

---

## 4. HDD 摘要

### 4.1 分层定位

```text
L0  Settings「偏好」UI          只表达用户意图
L1  AppearanceState             真源（可序列化）
L2  resolveTheme(state)         纯函数 → ResolvedTheme
L3  applyTheme(resolved)        唯一 DOM 副作用
L4  组件 / CSS                  只消费 var(--*) 与 data-*
```

问题主战场：**L1–L3**。先堆皮肤卡 UI 而不建 L1–L3 = 耦合债务。

### 4.2 假设与判定

| ID | 假设 | 类型 | 先验 | 证伪条件 | 判定 |
|----|------|------|------|----------|------|
| H1 | Lumen 应一等公民主题引擎，非 CDP 外挂 | 事前架构 | 0.75 | 必须改闭源宿主才能换肤 | ✅ 机制成立（自有源码） |
| H2 | 解耦关键 = State / Resolve / Apply + 组件零 skin 分支 | 事前架构 | 0.70 | 换皮肤需改 ≥3 业务组件 | ✅ 作为方案前提 |
| H3 | Phase A = Mode + 内置网格 + overlay/blur，无上传/社区包 | 范围 | 0.65 | 无上传则产品不可用（E2E 否决） | ✅ 默认范围 |
| H4 | 浅色全量与暗色皮肤同等优先 | 范围 | 0.30 | — | ❌ 不作 A 必达 |
| H5 | appearance 必须进 agent-service settings API | 范围 | 0.20 | — | ❌ A 用 localStorage 即可 |

**未达 V1/V2 的部分**：H1–H3 为事前架构假设，依赖 Phase A 实现后的 AT/E2E 升格；**不得**在实现前宣称「已验证换肤体验」。

### 4.3 方案 PT（机制可行性）

| ID | 检查 | 结果 |
|----|------|------|
| PT1 | 换 skin 是否只需改 state | 是（目标架构） |
| PT2 | resolve 可否无 DOM 单测 | 是 |
| PT3 | 与 model settings 分离 | 是（不同 storage key） |
| PT4 | 硬编码 aurora 是否挡换肤 | **是风险**；A 必须变量化或按 skin 关闭 |
| PT5 | Widget 是否跟 token | 是（现有 `themeVars`） |

---

## 5. 决策（现行提案）

### 5.1 架构决策记录（ADR 风格）

**决策 D1 — 三层管道**  
采用 `AppearanceState → resolveTheme → applyTheme`；禁止在业务组件中分支皮肤。

**决策 D2 — 双轴分离**

| 轴 | 字段 | 含义 |
|----|------|------|
| Mode | `mode: 'dark' \| 'light' \| 'system'` | 对比度基线（A 可先实现 dark + system 侦听，light 可映射到 dark 或占位） |
| Skin | `skinId: string` | 氛围包（背景 + token 补丁 + 默认 effects） |

另：**Effects**（`overlay` 0–1、`blurPx`）为用户可调，覆盖 skin 默认。

**决策 D3 — 存储**  
Phase A：`localStorage` 键 `lumen:appearance.v1`（仅 UI）。  
**不**写入 agent-service `PublicSettings`，避免与模型配置耦合。

**决策 D4 — 应用面**  
唯一写 DOM：`document.documentElement` 的 `data-appearance` / `data-skin` + `style.setProperty('--…')`；背景经 `--skin-bg-image` 等变量，由 `.app`（或专用层）消费。

**决策 D5 — 主题数据形态（A）**  
内置 `SkinDefinition` 注册表（代码内或 JSON 静态 import）。  
**不**在 A 阶段支持任意 `theme.css` 字符串执行。

**决策 D6 — 与 DreamSkin 包格式**  
**不兼容** DreamSkin ZIP（选择器与宿主 DOM 不同）。若 Phase C 做包，使用 Lumen 自有 manifest（见 §6.3）。

### 5.2 模块布局（提案路径）

```text
packages/ui-client/src/appearance/
  types.ts       # AppearanceState, SkinDefinition, ResolvedTheme
  registry.ts    # 内置皮肤
  resolve.ts     # 纯函数
  apply.ts       # 唯一副作用
  store.ts       # load/save lumen:appearance.v1
  systemMode.ts  # prefers-color-scheme

packages/ui-client/src/components/
  SettingsModal.tsx   # Pane 增加 'preference'
  PreferencePane.tsx  # 仅绑定 store API
```

### 5.3 数据流

```text
PreferencePane ──setState──► store ──subscribe──► App(or AppearanceRoot)
                                                      │
                                                      ▼
                                              resolveTheme(state)
                                                      │
                                                      ▼
                                               applyTheme(resolved)
                                                      │
                          ┌───────────────────────────┼──────────────────────┐
                          ▼                           ▼                      ▼
                   data-appearance              CSS variables            --skin-bg-*
                          │                           │                      │
                          └──────────── components / styles.css / widget ────┘
```

---

## 6. 合同（可审计细节）

### 6.1 AppearanceState（v1）

```ts
/** 用户意图真源；可 JSON 序列化 */
export type AppearanceMode = 'dark' | 'light' | 'system'

export interface AppearanceState {
  version: 1
  mode: AppearanceMode
  /** registry 内 id；未知 id 解析时回退 default */
  skinId: string
  /** 0 = 无遮罩，1 = 全黑遮罩；默认建议 0.35–0.55 */
  overlay: number
  /** 背景模糊 px；0 = 关 */
  blurPx: number
}
```

默认值（提案，实现前可微调但须写入单测）：

```ts
const DEFAULT_APPEARANCE: AppearanceState = {
  version: 1,
  mode: 'dark',
  skinId: 'default',
  overlay: 0.42,
  blurPx: 0, // 或 24；评审可改，需同步 AT
}
```

### 6.2 SkinDefinition（内置）

```ts
export interface SkinDefinition {
  id: string
  name: string
  /** 设置页缩略图（静态资源 URL） */
  preview: string
  /** 建议配 dark | light；与 mode 冲突时 resolve 规则见下 */
  preferredScheme: 'dark' | 'light'
  /** 背景：css url() 可用值，或 none */
  backgroundImage: string | null
  /** 仅允许覆盖白名单 token 键 */
  tokens: Partial<Record<AppearanceTokenName, string>>
  effects?: { overlay?: number; blurPx?: number; aurora?: boolean }
}
```

**Token 白名单（提案 · 实现时锁定列表）**  
至少包含：`--canvas`, `--paper`, `--paper-solid`, `--card`, `--ink`, `--ink-soft`, `--ink-mute`, `--ember`, `--ember-soft`, `--ember-tint`, `--sand`, `--sand-deep`, `--focus-ring`。  
**禁止**皮肤补丁写入任意未登记键（resolve 阶段丢弃未知键并 debug 日志）。

### 6.3 ResolvedTheme

```ts
export interface ResolvedTheme {
  colorScheme: 'dark' | 'light'  // system 已折叠
  skinId: string
  tokens: Record<string, string> // 完整可应用表（基线 ⊕ 补丁）
  backgroundImage: string | null
  overlay: number
  blurPx: number
  aurora: boolean
}
```

**resolve 规则（提案）**

1. `mode === 'system'` → 读 `prefers-color-scheme` 得 `colorScheme`。  
2. 查 `registry[skinId]`，缺失 → `default`。  
3. `tokens = baseline(colorScheme) ⊕ skin.tokens`（白名单过滤）。  
4. `overlay/blurPx`：用户 state 优先，否则 skin.effects，否则 DEFAULT。  
5. `aurora`：skin.effects.aurora ?? (skinId === 'default')。  
6. Phase A：`colorScheme === 'light'` 若无 light baseline → **回退 dark baseline** 并记 metrics（诚实降级，避免半套浅色）。

### 6.4 持久化

| 键 | 值 | 备注 |
|----|-----|------|
| `lumen:appearance.v1` | `AppearanceState` JSON | 坏数据 → DEFAULT + 覆盖写回 |

版本迁移：将来 v2 时读 v1 字段映射；未知 version → DEFAULT。

### 6.5 主题包（Phase C 草案 · 非 A 范围）

```text
lumen-skin.zip
  manifest.json   # id, name, version, preferredScheme, files[], sha256
  preview.webp
  background.webp
  tokens.json     # 仅白名单键，不是任意 CSS
```

- **不**支持 DreamSkin 的开放 `theme.css` 选择器模型（除非另立 Safe CSS RFC）。  
- 校验：大小上限、路径穿越拒绝、未知文件 fail-closed（哲学对齐 DreamSkin AGENTS，契约独立）。

### 6.6 设置 IA

```text
设置
├── 模型        （现有）
├── 提示词      （现有）
├── 偏好        （新增 · Appearance）
└── 常驻服务    （现有）
```

偏好页控件（A）：

1. 外观模式：深色 / （浅色可选占位）/ 跟随系统  
2. 皮肤网格：3–6 内置卡  
3. 覆盖强度、模糊（滑杆或步进）

---

## 7. 分期与爆炸半径

| Phase | 交付 | 爆炸半径 | 依赖 |
|-------|------|----------|------|
| **A** | 偏好页 + 内置 3–6 skin + overlay/blur + 持久化 + aurora 变量化 | 低–中（CSS 变量与 `.app`） | 无 service |
| **B** | 本地上传背景 + 用户 library（仍 token 白名单） | 中（文件、配额） | Tauri 文件 API 或 input file |
| **C** | ZIP 包 + 校验 + 导入库 | 中–高（供应链） | manifest 合同冻结 |
| **D** | 浅色认真打磨 | 高（全 UI 对比度） | 独立设计验收 |

**推荐 DEV 起点：仅 Phase A。**

---

## 8. 非目标（明确拒绝）

| 非目标 | 理由 |
|--------|------|
| CDP / 注入官方 Codex 或其它闭源壳 | 与 Lumen 产品无关；安全与维护成本错位 |
| 组件内 `skinId` 分支 | 破坏解耦；AT5 否决 |
| 外观写入 agent-service 模型 settings | 配置域污染 |
| Phase A 任意用户 CSS | XSS / 布局崩溃 |
| 兼容 DreamSkin ZIP 字节级 | DOM/选择器不同 |
| Phase A 完整浅色设计系统 | 工作量与 Glass 暗色假设冲突 |
| 换肤 remount 会话消息列表 | 破坏滚动/状态（AT8） |

---

## 9. 验收（AT · 实现前预注册）

实现 Phase A 时必须全部可自动或半自动验证：

| ID | 操作 / 输入 | 预期 |
|----|-------------|------|
| AT1 | 打开设置 | 存在「偏好」导航项 |
| AT2 | 切换内置皮肤 | ≤1 动画帧内背景/强调色变化；无需重启 |
| AT3 | 杀进程重开 | `skinId` / `mode` / overlay / blur 保持 |
| AT4 | `resolveTheme` 单测 | 合法 state 稳定输出；非法 skinId → default |
| AT5 | `rg "skinId\\s*===" packages/ui-client/src/components` | 业务组件零匹配（appearance/ 与 PreferencePane 除外） |
| AT6 | 切换皮肤 | 不调用 `updateSettings` / 不改 profiles |
| AT7 | 深色壁纸 + 默认 overlay | 正文 `--ink` 对比度抽查可接受（文档化抽查方法） |
| AT8 | 换肤时 | `messages` 容器不因 key=skin 强制 remount |
| AT9 | 默认 `skinId=default` | 观感不低于当前 Glass（回归截图或人工） |

**E2E（人）**  
- E1：三套皮肤来回切换观感  
- E2：重启保持  
- E3：进行中任务换肤不丢会话状态  

---

## 10. 实现锚点（落地时填写）

| 角色 | 路径 | 状态 |
|------|------|------|
| 类型/resolve/apply/store | `packages/ui-client/src/appearance/*` | 未建 |
| 设置页 | `SettingsModal.tsx` + `PreferencePane.tsx` | 未建 |
| Token 基线 | `tokens.css` / 可选 `tokens-light.css` | 现状仅暗色 |
| 画布消费变量 | `styles.css` `.app` | 需改 aurora |
| Widget | `themeVars.ts` | 已有读宿主能力 |
| 文档 | 本文 `doc/appearance-skin.md` | 提案 |
| 单测 | `tests/appearance-resolve.test.ts` 等 | 未建 |

---

## 11. 开放问题（评审须勾选）

请评审方对下列项给出 **采纳 / 修改 / 否决**：

- [ ] **Q1** Phase A 是否接受 **dark 优先**，light 诚实降级到 dark baseline？  
- [ ] **Q2** 内置皮肤资源：纯 CSS 渐变占位 vs 仓库内置 webp（体积预算？）  
- [ ] **Q3** `blurPx` 默认 0 还是非 0（性能：大模糊在弱 GPU 上的成本）？  
- [ ] **Q4** 用户自定义是否必须进 Phase B，A 绝不做上传？  
- [ ] **Q5** `lumen:appearance.v1` 是否足够，或需要进 `~/.lumen/` 文件以便多窗口一致（Tauri 多实例）？  

---

## 12. 评审检查清单（给审计 AI 的操作表）

请逐条输出 **PASS / FAIL / N/A** 与一句理由：

1. 问题与成功标准是否可测？  
2. §2 现状是否可被路径复验、有无过时断言？  
3. 外部调研是否误标为 V1/V2？  
4. 是否存在「未验证却当事实」的 V5 决策？  
5. State/Resolve/Apply 是否真解耦，有无隐藏第二写 DOM 点？  
6. 与模型设置隔离是否完整？  
7. Token 白名单是否足以防止主题补丁污染？  
8. Phase A 范围是否可独立上线？  
9. AT 表是否覆盖回归与安全（AT5/AT6/AT8）？  
10. 非目标是否足够防止范围膨胀（CDP/任意 CSS/DreamSkin 兼容）？  
11. 开放问题是否阻塞编码，或可带默认继续？  
12. 本文是否误称「已实现」？（正确状态应为提案）

---

## 13. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-08-12 | 初版提案：调研 + HDD + 解耦架构 + Phase A 合同；待评审，未实现 |

---

## 附录 A · 反模式速查

| 反模式 | 后果 |
|--------|------|
| `if (skin === 'mist')` 写在 Composer | 每新皮肤改 N 处 |
| 设置保存时 `updateSettings({ ..., skin })` | 模型配置域污染、权限与备份纠缠 |
| 皮肤 = 一整份复制的 `styles.css` | 无法维护、合并冲突 |
| 用户粘贴任意 CSS | XSS、把 `pointer-events` 弄没 |
| 换肤 `key={skinId}` 挂在 messages 根 | 丢失滚动位置与进行中 UI 状态 |

## 附录 B · 参考链接

- Codex-Dream-Skin: https://github.com/Fei-Away/Codex-Dream-Skin  
- 本仓库 token / 主题: `packages/ui-client/src/tokens.css`, `theme-celadon.css`, `index.html`  
- 设置壳: `packages/ui-client/src/components/SettingsModal.tsx`  
- 项目 HDD skill: `.claude/skills/hdd/SKILL.md`  
