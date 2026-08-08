# adapters/ — ModelPort 实现层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把具体 provider 适配成内核唯一认识的 `ModelPort`。内核之外的一切网络与格式差异都消化在这里。

## 成员

- `claude.ts` — Claude Messages API:整包 + SSE streamTransport / createClaudeAdapter
- `claude-sse.ts` — Anthropic SSE 纯函数拼装(可 fixture 单测)
- `openai.ts` — OpenAI 兼容端点:整包 + SSE;DeepSeek V4 thinking 默认 enabled、抬 max_tokens、回灌 reasoning_content、空正文抛错
- `openai-sse.ts` — OpenAI SSE 纯函数拼装 + consumeSseDataStream
- `stream-coalesce.ts` — text_delta 按字数/时延合并,压 WS 洪水
- `record-replay.ts` — 录制 / 重放 transport:测试基座,fixture 为真实线格式
- `retry.ts` — postJsonWithRetry:单次超时 + 指数退避(claude/openai 共用的可靠性层)
- `index.ts` — 出口
- DeepSeek 带图:不在 adapter 硬编码兜底;由 `tools/env/vision-tools` 的 `withImageSanitize` + `look_at_image` 在 runtime 收口(去 image_url / 侧车识图)

## 规则

- 新增 provider = 新文件实现 ModelPort,不改内核、不在 runtime 里写 if-else。
- 网络只出现在 transport 缝;测试经 record-replay 注入,不 mock 内核路径。
- 瞬时错误(429/5xx/超时)在 retry 层消化;鉴权错误(401)如实上抛,runtime 转成用户可读错误事件。
