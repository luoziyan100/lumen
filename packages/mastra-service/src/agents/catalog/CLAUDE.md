# agents/catalog/
> L2 | 父级: ../CLAUDE.md

角色文件是启动或首次打开项目时读取的配置快照，不参与运行状态；保留旧 Markdown 格式和层级覆盖，能力始终落在当前原生工具白名单内。

```text
catalog/
├── types.ts
├── parse.ts
├── discovery.ts
├── policy.ts
├── registry.ts
├── toggles.ts
├── projects.ts
└── routes.ts
```

- `types.ts`：声明发现根、旧格式定义、来源诊断和静态目录快照；不依赖旧 Agent 内核。
- `parse.ts`：解析根目录 Markdown 或 AGENT.md 的标量 frontmatter，拒绝错误名称和无界正文。
- `discovery.ts`：有界扫描显式根，忽略隐藏文件，拒绝链接和特殊文件，保留可展示的配置诊断。
- `policy.ts`：能力、preset、显式 tools 和同名内建上限取交集；步数不超过所选角色上限，禁止嵌套和共享写入。
- `registry.ts`：按 project > workspace > builtin > user > plugin 合并，再应用 true=禁用的全局开关。
- `toggles.ts`：受限读取与串行原子保存启停配置，修改仅影响之后显式加载的快照。
- `projects.ts`：首次进入项目时加载并注册唯一内部 Agent 身份，转发委派上下文过滤和生命周期钩子，传递应用统一的专家用量派生器，公开工具名保持角色名；空闲配置变更排空并移除旧注册。
- `routes.ts`：项目角色清单、全局启停与显式重载；统一配置写锁阻止执行跨越角色切换边界。

旧 `isolation: worktree` 改由独立 `workers/` 目录和主 Agent 审阅复制实现；不迁入旧 Git 协调器。`allow_nested` 只产生迁移诊断，不开放另一层委派。动态项目接线使用同一公开角色名和不同内部 Agent ID。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
