# tests/ — ui-client 契约测试

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

`node:test` + 先 `tsc --noEmit`。锁用户可见合同与纯函数,不替真实 Markdown/Mermaid 内核做空壳 mock。

夹具在 `fixtures/`(见该目录 CLAUDE.md)。本轮渲染修复相关:

- `markdown-math.test.ts` — 数学定界符归一 + KaTeX SSR;含跨围栏/code span 不得配对 closer
- `mermaid-layout.test.ts` — SVG 固有尺寸政策(无卡片 max-width)+ ELK initialize
- `mermaid-measure-host.test.ts` — 宽度分桶缓存键;tighten 后才进缓存
- `mermaid-syntax.test.ts` — Phase A;L98 极宽 LR 不改方向
- `app-contract.test.ts` — 卡片横滚 CSS 与 lightbox 宿主分离

其余 `*.test.ts` 仍按文件头 L3 维护;新增测试文件必须带 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]`。
