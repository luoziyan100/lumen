# 对话内流程图（Mermaid）

状态: **现行**（2026-11-10 重做；取代 `mermaid-pipeline.md` 与 `mermaid-readability.md` 的执行合同，二者保留为决策历史）

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 意图

研究回答里的一张图要做到四件事，按优先级：

1. **画得出来**：模型写的 DSL 不可信，常见脏语法不该让用户看到报错。
2. **失败诚实**：画不出来时用户能看到原文和原因，图块不消失。
3. **读得动**：层次清楚、线不乱、字不被缩小；宽图能横向滚动，能放大。
4. **像这个应用的一部分**：颜色跟随当前外观（明暗、玻璃/纸面），模型只表达语义，不决定像素。

## 设计

```text
模型原文 ─► 语法修补 R1–R7 ─► 宿主颜色裁决 ─► 同源 mermaid.parse ─┬─► 箱外 render + 墨迹收紧 ─► 一次提交 SVG
            (mermaidSyntax)    (mermaidTheme)                     └─► 失败：短错误 + 详情 + 原文 +「请模型修正」
```

| 层 | 做法 | 位置 |
|---|---|---|
| 生成约束 | persona 画图规则：`ID["简短标题"]`、先闭合再写边、长链 TD、分支边标签、subgraph/end 成对、sequence 语法、约 15 节点、不写颜色，强调用语义 class | `packages/mastra-service/src/agents/persona.ts`；`tests/persona.test.ts` 核对实际请求 |
| 语法修补 | R1 弯引号；flowchart 专属：危险标签加引号、补漏 `]`、` -> ` 改 ` --> `；按图类型门控，不改节点 ID，不加新规则除非出现新的高频脏数据 | `ui-client/src/mermaid/mermaidSyntax.ts` |
| 颜色 | 渲染时从当前外观 token 现取调色板（半透明 token 压到画布底色上），`theme:'base'` + 明暗随画布亮度。剥掉模型写的 `%%{init}%%` 与 style/classDef/linkStyle 中的颜色属性（线宽等保留）；用到的语义 class（ok/success、warn/warning、danger/error、accent/primary/focus/highlight、muted/secondary）按主题定义 | `mermaidTheme.ts` |
| 校验与渲染 | parse 与 render 用同一个 mermaid 实例；`initialize`+parse+render 串行，防并发图互相覆盖全局配置；flowchart 优先官方 ELK，注册失败回退 dagre | `components/MermaidBlock.tsx`、`mermaidLayout.ts` |
| 几何 | 箱外测量宿主里按墨迹收紧 viewBox，主流只接收最终 SVG；SVG 保持固有宽，不写 `width:100%` 或卡片 `max-width`，宽图由 `.mermaid-scroll` 横滚 | `mermaidMeasureHost.ts`、`styles.css` |
| 缓存 | 会话内内存：原文 hash @ 列宽桶 @ 主题签名；换皮肤即按新主题重画，旧图在新图就绪前保持可见 | `MermaidBlock.tsx` |
| 放大 | 独立放大层：± 钮、滚轮/触控板、双指缩放、单指拖移、Esc 关闭 | `components/MermaidLightbox.tsx`、`mermaidZoom.ts` |
| 失败修正 | 「请模型修正」把原图与解析错误作为**普通用户消息**发回当前会话（与 widget 回发同一出口），只要求重发这一张图；每张失败图只发一次；流式中与阅读器内不出现 | `AssistantContent.tsx` → `Markdown` → `MermaidBlock`；文案 `copy/appCopy.ts` |

复制按钮始终复制模型原文；修补与颜色裁决只影响像素。

## 相对旧实现的取舍（2026-11-10）

| 旧做法 | 处置 | 理由 |
|---|---|---|
| 固定暗色色板 + WCAG 对比度引擎改写模型给的 hex | **删除**，改为主题 token 现取 + 剥离模型颜色 | 旧色板只适配暗色玻璃，浅色皮肤下语义节点成深色色块（Chrome 实渲复现）；模型不该决定像素，语义 class 足够表达强调 |
| `theme:'dark'`、`darkMode:true` 写死，缓存不含主题 | **改为** `theme:'base'` + 调色板明暗，缓存键含主题签名 | 同上；换皮肤不重画 |
| Phase B `repair_mermaid` sidecar（单独 WS 协议、本地替换像素不落库） | **改为**会话内普通消息 | 服务端已随旧 agent-service 退役；新方式走 Mastra 原生消息与历史，可审计，无第二套协议 |
| `mermaidMetrics` 本地计数（为 Phase C 阈值准备） | **删除** | 从未展示或汇总，阈值永远无法计算 |
| 放大层手势内联在渲染组件中 | **拆出** `MermaidLightbox` | 渲染与交互分离；行为不变 |

## 验证

- `tests/mermaid-syntax.test.ts`：规则、门控、错误摘要。
- `tests/mermaid-theme.test.ts`：真实明暗基线 token 的调色板、颜色剥离与语义 class。
- `tests/mermaid-block.test.ts`：真实组件 + 真实 `mermaid.parse` 的失败卡与修正消息。
- `tests/mermaid-layout/measure-host/zoom.test.ts`：初始化合同、固有尺寸、测量与缩放算术。
- 像素、ELK 与横滚无法在 jsdom 中验证，须在安装后的桌面应用中核对。
