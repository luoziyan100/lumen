# shell/ — 桌面能力薄封装

> L2 | 父级: ../../CLAUDE.md

- `pickFolder.ts`：通过 Tauri 选择本机文件夹，供项目和资料源配置使用；不解析工作区存储布局。
- `pickSkill.ts`：用户选择技能目录或Markdown后生成完整相对文件清单；桌面保留空目录和脚本执行位，浏览器使用File目录信息。

2026-09-19：旧栏宽 hook 与旧工作区路径拼装退役；文件读取交给 Mastra 服务的权限边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
