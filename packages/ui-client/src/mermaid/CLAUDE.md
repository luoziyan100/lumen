# mermaid/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

流程图渲染前闸。对人报错在语法闸;Phase B 回灌走 `repair_mermaid`。

## 成员

- `mermaidSyntax.ts` — 确定性语法闸(flowchart 含 R7 补 `]`);见 `doc/mermaid-pipeline.md`
- `mermaidSanitize.ts` — 语义 class / 字面色对比度
- `mermaidLayout.ts` — 官方 ELK(失败回 dagre)+ SVG 固有尺寸归一(剥离百分比宽/卡片 max-width);卡片横滚与 lightbox fit 由 CSS 决定;见 `doc/mermaid-readability.md`
- `mermaidMeasureHost.ts` — 箱外测量宿主 + 墨迹收紧 + 宽度分桶缓存键;主流只收 final SVG
- `mermaidZoom.ts` — 放大层缩放/平移算术
