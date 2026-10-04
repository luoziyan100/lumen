# mastra/
> L2 | 父级: ../../CLAUDE.md

桌面唯一入口直接消费 Mastra 原生消息与 displayState，不转换回旧 WS 事件。默认发现正式数据根，显式参数或环境变量保留隔离预览；发现失败展示重试入口。

- `data/`：产品 HTTP 与官方 SDK、会话订阅/重连补取。
- `views/`：新数据上的研究工作台，恢复原 titlebar/sidebar/chat/composer/reader 结构、外观设置与文件交互，复用 Markdown/PDF 与设计 token。
- `diagnostics/`：受信 trace、问题标注、显式录制回放/当前模型评估、导出和离线包查看；运行完成与文本匹配分开，缺证据如实显示。
- `agents/`：项目角色来源、权限、启停和显式重载；不接管子任务执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
