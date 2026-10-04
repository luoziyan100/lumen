# agents/usage/
> L2 | 父级: ../CLAUDE.md

```text
usage/
└── children.ts
```

- `children.ts`：从公开委派钩子绑定父线程和原生 run/toolCall 身份；专家每次模型响应的真实 usage 按步骤与重试编号覆盖保存到原生 threadState，再派生专家累计值。

Controller 只统计主 Agent 顶层 step-finish；专家步骤被原生 ToolStream 包装为 tool-output，未进入该统计。专家 processor 放在空答复守卫之前，已发生的模型消耗先落盘，之后重试、停止或工具失败不抹账。重复步骤覆盖同一条派生 receipt，同父线程的并行专家串行合并；不复制运行状态或建调度账。

不只依赖 onDelegationComplete：失败结果可能无 usage，取消也不能丢掉此前已完成步骤。无 provider usage 时不估算，旧导入没有派生记录时返回 null。硬崩溃或取消发生在 provider usage 到达之前的消耗无法计算；不是账单或费用上限。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
