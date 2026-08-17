# 产物闭环（当前稿）

状态: **现行**（2026-08-17 · P0 真机验收通过）

长交付的默认归宿是工作区文件。人与模型的注意力钉在**当前可写 path**，而不是钉在气泡上。

交叉:上传知情附言同构 `upload-awareness.md`；铁律 `agent-core-architecture.md` §1（只增线程 + tool_result 回灌）。

## 双表面

- **对话流**：商量、过程、短结论、路径指针。
- **产物面**：阅读器 / 工作区文件；可迭代长交付必须能回到文件。

磁盘是真源。不做云 Artifact 库、不做静默自动落盘、P0 不改 persona。

## Active Document

客户端状态 `activePath: string | null`，作用域 **`(projectId, taskId)`**。切项目或切会话必须清除。关闭阅读器不解除绑定；换绑靠打开另一可绑文件或手动清 chip。

### 可绑

同时满足：工作区相对路径、可 `read_file` 的文本白名单、当前会话可 `write_file`/`edit_file`（典型 `drafts/` `notes/` 会话文本）。排除 `shared/` `cache/` `library/`。

### 只开不绑

可进阅读器，**不**设 activePath、**不**注入「请 edit 此 path」：PDF / 图片 / 二进制 / `shared/` 只读源 / **HTML/HTM 预览**。已有 chip 时打开只开不绑**不自动清**。

### 附言真源（与 S4 同构）

| 步骤 | 合同 |
|---|---|
| 客户端 | `submit` / `continue` **携带** `activePath`；禁止把附言拼进展示用 `userText`/`content` |
| 持久化 | user 事件 payload 存 `activePath`（合法才写）；展示 `content` 不含附言 |
| 喂模型 | `rebuildThread` / 首轮只在 `upload-awareness.ts` 拼 `formatActivePathAnnex` |
| 续聊 / 压缩恢复 | 从 payload 读回再拼 → 模型仍见；气泡仍干净 |

服务端再闸一次（`sanitizeActivePath`）：超界 / 只读 / 二进制 / 空串 → **不持久化、不拼附言**，不打断发送。

## 写盘可见

write/edit 的 `ToolResult.data.path` 并入 `tool_result` payload。UI 优先读结构化 `path`；缺失时回退同 id 的 `tool_call.args`（含 `file_name` 别名）；仍无 →「完成(无 path)」，禁止抛错或崩过程行。

P0 不强制 write 后自动打开阅读器。若阅读器已打开且 `open.path` 等于刚成功的 path → **自动 `readAsset` 重载**。

## 不做

静默把每条长回复存成 md；改 `persona.ts`；侧栏源/稿分面与气泡路径可点（P1+）。

## 实现锚点

- 附言 / 消毒：`packages/agent-service/src/runtime/upload-awareness.ts`
- 落库：`event-hub.emitUser`；重建：`storage/resume.ts`
- 协议：`messages.ts` 的 submit/continue `activePath`；ui-client `agent-client` 同步携带
- 方案 A path：`fs-tools` → `loop.ts` emit → `chat/reduce.ts`
- UI：`activePath.ts` chip 白名单；`App.tsx` 作用域与阅读器刷新；`ComposerCard` chip

## 验收（P0 · 2026-08-17 真机）

十一条与三条否证已在 launchd 8787 + `/Applications/Lumen.app` 取证（事件记录 + 截图，目录 `/tmp/lumen-p0-accept/`）。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
