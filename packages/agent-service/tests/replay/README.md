# 录制-重放（验收的反自欺底座）

old_lumen 的 50 个绿测试没拦住致命 bug，因为替身被注入到循环内部，绕过了真实内核。
这里的规则：替身只放在**网络缝**（`ClaudeTransport`）上，请求构造、响应解析、`runAgent` 全走真实代码。

## 重放（默认，无需 API key）

`fixtures/*.claude.json` 是 Anthropic Messages API 的真实线格式响应序列。
`createReplayTransport(fixture)` 按序喂回，并记录内核**真实发出**的每个请求供断言。

```
npm test
```

## 录制真实对话（需要 API key）

用 `createRecordingTransport` 包住真实 `createFetchTransport`，跑一次真实任务，把 sink 写进 fixture：

```ts
const sink: ClaudeResponseBody[] = []
const transport = createRecordingTransport(createFetchTransport({ apiKey: process.env.ANTHROPIC_API_KEY! }), sink)
const adapter = createClaudeAdapter({ transport, model: 'claude-sonnet-4-6' })
// ... runAgent(...) ...
writeFileSync('fixtures/<name>.claude.json', JSON.stringify(sink, null, 2))
```

录下来的 fixture 与手写的形状完全一致，可直接替换，让重放跑在真实模型轨迹上。
