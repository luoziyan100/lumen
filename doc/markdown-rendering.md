# Markdown 渲染（数学定界符 · 代码区冻结 · 流式 deferMath）

状态: **现行** · 2026-08-31  
实现: `packages/ui-client/src/components/Markdown.tsx`、`markdownMath.ts`  
KaTeX 栈: `react-markdown@10` + `remark-math@6` + `rehype-katex@7` + `katex@0.17`

> [PROTOCOL]: 变更时更新此头部与修订记录，再动代码；完成后检查 `doc/CLAUDE.md`。  
> 产品承诺的不是「装了 KaTeX」，而是：用户在最终回答里看见的常见 Markdown/LaTeX 数学，必须在 tokenizer 层成为 math node，再交给 KaTeX。

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-08-31 | 初版：兼容 `\(...\)` / `\[...\]` 与 `$` / `$$`；代码区不解析；流式 `deferMath` |

---

## 1. 定界符矩阵

| 形式 | 角色 | 终稿 |
|------|------|------|
| `$x$` | 行内 | KaTeX inline |
| 单独成段的 `$$ ... $$` | 独立公式 | KaTeX display（`remark-math@6` 认带换行的 `$$` 块，不把单行 `$$x$$` 当 display） |
| `\(...\)` | 行内 | 终稿前归一成 `$...$`，再进 KaTeX |
| `\[...\]`（可跨行） | 独立公式 | 终稿前归一成带换行的 `$$...$$`，再进 KaTeX |

未闭合或 opener 被转义（奇数个前置反斜杠）时保持普通文本，禁止吞掉后文。

公式 body 内的 TeX 转义（`\{`、`\}`、`\ldots`）原样保留。归一化幂等。

---

## 2. 代码区不解析数学

下列区域逐字复制，不把定界符当成公式：

- 最多 3 个前导空格后的 backtick / tilde fenced code（`mermaid` / `tex` / `js` / `show-widget` / 无语言）
- 任意长度反引号 inline code span（只由相同长度反引号关闭）

未闭合的 `\(` / `\[` **不得**跨 fenced code 或 inline code 去配对 closer。代码区里的 `\)` / `\]` 不是数学闭合符。

禁止用全局正则扫整篇 Markdown。禁止在 CommonMark 吃掉反斜杠之后，从普通 paragraph 文本猜哪些括号曾经带反斜杠。

---

## 3. 流式 vs 终稿

| 阶段 | `deferMath` | 数学 | mermaid |
|------|-------------|------|---------|
| 流式 | `true` | 不跑 `normalizeMathDelimiters`，不挂 `remark-math` / `rehype-katex` | 源码 `<pre>` |
| 终稿 / Reader | `false` | 先归一再 KaTeX | `MermaidBlock` 箱外 tighten 后一次提交 |

半截 `\( ` 或 `$$` 会让 KaTeX 成败交替 → 高度非单调。兼容层不得在流式期引入这种抖动。

对话终稿与 Reader Markdown 使用同一合同（Reader 默认 `deferMath=false`）。

---

## 4. 责任边界

```text
模型字节
  → normalizeMathDelimiters（仅终稿；fence-aware）
  → remark-gfm + remark-math
  → math node
  → rehype-katex
  → .katex / .katex-display
```

- 定界符方言：`markdownMath.ts`
- 排版：KaTeX。公式没进 math node 时禁止当成字体/CSS/KaTeX 配置事故。
- persona 可建议优先 `$` / `$$`，但不能代替本层兼容。

Mermaid 图几何与横滚见 `doc/mermaid-readability.md`，不在本文。

---

## 5. 测试锚点

| ID | 锚点 |
|----|------|
| M-T1..M-T14 + 跨代码区 closer | `packages/ui-client/tests/markdown-math.test.ts` |
| L98 数学夹具 | `packages/ui-client/tests/fixtures/l98-rendering.ts` → 2 display + 4 inline |
| 接入 | `Markdown.tsx`：`deferMath ? children : normalizeMathDelimiters(children)` |

验收必须查 AST/HTML/DOM（`.katex` / `.katex-display`），不能只查依赖是否安装。

---

## 一句话合同

**终稿把 `\(...\)` / `\[...\]` 与 `$` / `$$` 一样交给数学解析器；代码围栏与 inline code 原样不动；流式不跑 KaTeX。**
