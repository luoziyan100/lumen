# aura/ — 气场(状态可视化)

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;状态→视觉映射的实质修改属设计决策,先过 `doc/ui-design.md`。

职责:agent 状态的氛围可视化——三层 shader(MeshGradient 底色 + NeuroNoise 认知纹理 + PulsingBorder 边缘光),由 `AuraState` 驱动。
**定位是氛围件,不是背景**:除空态封面外,只在页面边缘可见(正文由纸面层遮护,见 ui-client/CLAUDE.md 设计纪律)。

## 成员

- `states.ts` — 核心契约:AuraState → AuraParams(此目录可整体搬运的根)
- `LumenAura.tsx` — 三层 shader 装配(multiply=浅底渗墨 / screen=暗底发光)
- `lumenTheme.ts` — LUMEN_CELADON_AURA_MAP:青瓷主题的各状态参数
- `deriveAuraState.ts` — 从 connected/running/items 推导状态(idle/listening/thinking/researching/writing/blocked/done)
- `useAuraState.ts` — 状态展示节奏(done 短暂驻留后回 idle)
- `useAnimatedParams.ts` / `color.ts` — 参数插值与颜色工具
- `themes.ts` — 试验台主题集(playground 用,非生产映射)

## 规则

- UI 强调色随状态微调在 `styles.css` 的 `.app[data-aura-state]` 块,与本目录的 shader 参数是两条线:blocked 在 UI 侧转琥珀,shader 侧如需跟进先过设计文档。
- 性能:三层 shader 常驻 GPU;「闲置降速/暂停」是已立项待办,做时在此记录。
