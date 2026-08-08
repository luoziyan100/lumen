# 上传知情（对话事件）

状态: **现行**（2026-08-09）

## 问题

文件已落盘、侧栏可见，但本回合线程无附件信号 → 模型装瞎 / 找错 `img-N` / 盲 `list_dir`。侧栏 ≠ 知情。

## 决策（HDD · S4）

**上传 = 对话事件。** 知情层对**全部附件**一视同仁；内容层按族分叉（与 `document-ingest.md` 同构）。

```
人：user 气泡 file chip（可点开阅读器）
机：同 turn 附言（由 uploads[] 在 rebuild/首轮注入，气泡不展示原文）
    文件名 → 工作区路径 → 表示提示
盘：saveUpload 外脑不变
```

1. **凡 `saveUpload` 成功并随本回合发送** ⇒ user 事件必带 `uploads[]`；模型上下文 = 用户正文 + 附言。
2. **附言范围**：PDF / 图 / Office / HTML / zip / 未知 —— **无扩展名例外**。
3. **表示提示**（内容层，可空增强）：
   - 图：多模态另附 `images` 时注明视觉可见；仅落盘则给路径
   - PDF：`extract_pdf(source=路径)`
   - docx 等已摄取：指向 `docs/*.md`
   - 可读文本（md/html/…）：`read_file`
   - opaque（zip 等）：原件路径 +「未抽取」
4. **不做默认**：把整本 PDF/大文件全文塞进 prompt；仅靠侧栏 / `list_dir` / system digest 替代本回合附言。

## 验收

只拖 `X.pdf`、不打字发送 → 气泡有 chip；模型第一句能点名 `X.pdf` 并开始处理。

## 实现锚点

- 附言：`packages/agent-service/src/runtime/upload-awareness.ts`
- 落盘回执：`AgentRuntime.saveUpload` → `UploadReceipt`
- 协议：`submit` / `continue` / user 事件 payload 的 `uploads`
- UI：`useAgent` chip + `App` 发送时携带回执

## 交叉

- 摄取解析：`document-ingest.md`（读可见）
- 铁律：`agent-core-architecture.md` §1（后果回灌同一条线程）
