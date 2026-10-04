# appearance/ — 客户端外观偏好

> L2 | 父级: ../../CLAUDE.md

用户偏好先经纯函数归一和主题解析，再由单一 DOM 出口应用；服务配置与 Agent 生命周期不参与主题状态。

```text
index.ts → store.ts / systemMode.ts → resolve.ts → apply.ts
                                      ↓
                                registry.ts / types.ts
```

- `index.ts`：整合启动恢复和 React 订阅，给应用提供唯一外观入口；Mastra 工作台挂载 useAppearance，恢复系统主题变更订阅与设置即时应用。
- `types.ts`：偏好、皮肤、解析结果与允许覆盖的 token 真源。
- `registry.ts`：内置整窗皮肤定义与未知皮肤回退，保持壳、纸面和强调色成套变化。
- `store.ts`：读取、归一并持久化本地偏好，损坏值退回确定的默认状态。
- `systemMode.ts`：隔离系统明暗媒体查询与订阅，不直接更改 DOM。
- `resolve.ts`：从偏好和皮肤计算允许的 token 补丁，保持无副作用。
- `apply.ts`：唯一 DOM 写入端，清理旧补丁并应用解析后的属性和 token。

2026-09-19：补齐保留外观模块地图；Mastra 迁移继续复用同一客户端偏好入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
