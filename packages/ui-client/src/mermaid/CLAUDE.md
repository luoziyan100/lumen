# mermaid/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

流程图渲染前闸，合同见 `doc/mermaid.md`。失败对人显示源码与错误；对模型的修正走会话内普通消息（`MermaidBlock` → `AssistantContent.onSendMessage`），不另设协议。

## 成员

- `mermaidSyntax.ts` — 确定性语法闸 R1–R7(flowchart 含 R7 补 `]`),修补后交 mermaidTheme
- `mermaidTheme.ts` — 从当前外观 token 现取调色板(明暗/半透明压底)、剥离模型颜色与 init、按主题定义语义 class;共享根元素观察者,主题签名变化才通知
- `mermaidLayout.ts` — 官方 ELK(失败回 dagre)+ SVG 固有尺寸归一(剥离百分比宽/卡片 max-width);卡片横滚与 lightbox fit 由 CSS 决定;见 `doc/mermaid.md`
- `mermaidMeasureHost.ts` — 箱外测量宿主 + 墨迹收紧 + 宽度分桶缓存键;主流只收 final SVG
- `mermaidZoom.ts` — 放大层缩放/平移算术

颜色唯一入口是 `mermaidTheme.ts`；2026-11-10 删除按暗色写死的 `mermaidSanitize.ts`(固定色板 + 对比度引擎)与无消费者的 `mermaidMetrics`。
