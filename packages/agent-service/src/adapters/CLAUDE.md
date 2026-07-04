# adapters/ — ModelPort 实现层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:把具体 provider 适配成内核唯一认识的 `ModelPort`。内核之外的一切网络与格式差异都消化在这里。

## 成员

- `claude.ts` — Claude Messages API:请求构造 / 响应解析 / fetch transport / createClaudeAdapter
- `openai.ts` — OpenAI 兼容端点(含 DeepSeek 等):同上 + 录制重放支持
- `record-replay.ts` — 录制 / 重放 transport:测试基座,fixture 为真实线格式
- `retry.ts` — postJsonWithRetry:单次超时 + 指数退避(claude/openai 共用的可靠性层)
- `index.ts` — 出口

## 规则

- 新增 provider = 新文件实现 ModelPort,不改内核、不在 runtime 里写 if-else。
- 网络只出现在 transport 缝;测试经 record-replay 注入,不 mock 内核路径。
- 瞬时错误(429/5xx/超时)在 retry 层消化;鉴权错误(401)如实上抛,runtime 转成用户可读错误事件。
