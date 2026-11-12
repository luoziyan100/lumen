# agents/catalog/
> L2 | 父级: ../CLAUDE.md

角色文件是首次用到专家时读取的全局配置快照（专家不分主题），不参与运行状态；保留旧 Markdown 格式和层级覆盖，能力始终落在当前原生工具白名单内。

```text
catalog/
├── types.ts
├── parse.ts
├── discovery.ts
├── policy.ts
├── registry.ts
├── toggles.ts
├── group.ts
└── routes.ts
```

- `types.ts`：声明发现根、旧格式定义、来源诊断和静态目录快照；不依赖旧 Agent 内核。
- `parse.ts`：解析根目录 Markdown 或 AGENT.md 的标量 frontmatter，拒绝错误名称和无界正文。
- `discovery.ts`：有界扫描显式根，忽略隐藏文件，拒绝链接和特殊文件，保留可展示的配置诊断。
- `policy.ts`：能力、preset、显式 tools 和同名内建上限取交集；步数不超过所选角色上限，禁止嵌套和共享写入。
- `registry.ts`：按 builtin > user > plugin 合并（同名内建优先），再应用 true=禁用的全局开关。
- `toggles.ts`：受限读取与串行原子保存启停配置，修改仅影响之后显式加载的快照。
- `group.ts`：全局唯一一组专家：读取 `<数据根>/subagents` 与启停文件，注册带角色定义哈希的内部 Agent 身份，转发委派上下文过滤和生命周期钩子，传递应用统一的专家用量派生器；空闲配置变更排空并移除旧注册。
- `routes.ts`：全局角色清单（`/agents`）、启停与显式重载；统一配置写锁阻止执行跨越角色切换边界。

旧 `isolation: worktree` 改由独立 `workers/` 目录和主 Agent 审阅复制实现；不迁入旧 Git 协调器。`allow_nested` 只产生迁移诊断，不开放另一层委派。定义变化时内部 Agent ID 随哈希变化，公开角色名不变。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
