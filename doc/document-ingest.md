# 文档摄取（读可见 vs Skill 创作）

状态: **现行**（2026-08-08）

## 问题

复合格式（`.docx` 等）不是纯文本。若只落盘原件、指望模型 `run_code` 解包，则：用户已上传却「看不了」；沙箱一挂产品违约。

## 决策（HDD）

**读 / 可见 → 模式 A（摄取解析）**；**写 / 深改 / 版式 → 模式 B（Skill）**。

```
上传 Office 等复合件
        │
        ▼
【A】框架侧抽取 → docs/*.md（可 read_file）+ 原件保留
        │
需要创建/修订/版式？
        └─【B】Skill + 预装库/脚本碰原件（后续）
```

1. **摄取解析**：`saveUpload` 对已知复合格式抽取纯文本/Markdown，写入 `docs/`，原件仍落 `uploads/`（或对应族目录）。
2. **产品承诺**：上传后模型应读 `docs/` 抽出稿，不得要求用户先转 PDF/粘贴（抽取失败除外，须明示）。
3. **Skill**：不替代摄取；用于生成/编辑 OOXML 等。无对应 Skill 时，读路径仍由 A 保证。
4. **PDF**：已有 `extract_pdf` / `papers/`；与 A 同哲学，实现可分立。

## 非目标（本轮）

- 上传时完整保留修订痕迹/版式保真编辑
- 一等 `docx` Skill 包（B 轨后续）
- xlsx/pptx 抽取（可按 A 同构追加）

## 实现锚点

- 抽取：`packages/agent-service/src/tools/ingest/docx.ts`
- 摄取：`AgentRuntime.saveUpload`
- 宪法交叉：`doc/agent-core-architecture.md` 工具节
