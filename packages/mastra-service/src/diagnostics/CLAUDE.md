# diagnostics/
> L2 | 父级: ../CLAUDE.md

诊断使用原生 Observability → MastraStorageExporter → LibSQL observability 存储。用户问题标注单独保存，既不复制运行状态，也不修改原生 trace。

- `types.ts`：标注输入、脱敏 trace 视图、隔离评估与诊断覆盖合同；原始 HTTP、完整副作用和位级回放明确不在覆盖范围。
- `redact.ts`：有界递归脱敏；键名、URL、Bearer、已知凭证和裸编码二进制在采集及导出使用同一规则。
- `telemetry.ts`：原生可热关采集与本地存储导出；输入/输出分别记录裁剪状态，避免大工具定义误伤完整输入；官方总线只注册 trace handler，处理器失败丢弃 span。
- `notes.ts`：SQLite 用户评语和最近评估；所有读写以 resourceId 限定，编辑清除旧结果，晚到评估按版本拒绝回填。
- `export.ts`：有限 JSON 诊断包及只读离线检查；校验完整性，不调用模型、工具、进程或网络。
- `service.ts`：可信会话授权、trace 归属核对、标注、隔离评估与导出；独立子资源跨度明确省略；读取按当前凭证再次脱敏，关闭取消并排空评估。
- `index.ts`：应用组合出口，不开放存储内部实现。
- `evaluation/`：独立 Mastra Agent 的录制模型/工具桩回放及当前模型无工具评估；60秒有界，只将结果保存到问题标注。

接入：createDiagnostics 接收可信 authorize、采集开关、凭证 resolver 与当前 liveModel getter；observability 交给 Mastra。应用先排空运行和 trace，关闭时 await diagnostics.close() 取消并等待隔离评估，之后才关标注库。

边界：trace 是 SDK 级观察，completeAudit 恒为 false。离线打开只展示记录；显式 evaluate 才运行独立 Agent。录制模式只有内存模型/工具桩，证据不足 unavailable；live 只调用当前模型、无工具、无生产会话。预期文本匹配不等于语义质量验证。原始HTTP与任意副作用仍不作覆盖承诺。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
