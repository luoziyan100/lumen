# skills/
> L2 | 父级: ../CLAUDE.md

技能是可显式启动的工作流与只读资源包；不修改系统提示词、不执行包内代码。所有根由应用注入，工具与产品 API 共用同一 registry，安装来源限于任务工作区。

- `types.ts`：技能元数据、发现层级与显式目录配置；source > project > user。
- `parse.ts`：有限 frontmatter、名称和一次性参数替换；保留正文，不对用户参数再次插值。
- `files.ts`：路径与体积边界、拒绝链接的安装复制、同根串行发布；失败保留原包。
- `upload.ts`：完整目录上传的路径/体积/重名校验，在任务私有临时目录保留资源、空目录与执行位，复用原子安装后清理。
- `registry.ts`：实时发现、激活、读资源、工作区与完整上传包安装/卸载；两类安装共用原子发布，不执行包内代码。
- `tools.ts`：Mastra 原生 list_skills/run_skill/read_skill_file/install_skill，与产品接口共用实现。
- `index.ts`：公开 registry、原生工具和纯解析契约。

设计决策：安装先验证并复制到发现根内隐藏 staging，再替换目标；发现和读取验证 realpath，包内脚本需由应用另行交给沙箱执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
