# src/
> L2 | 父级: ../CLAUDE.md

- `main.rs`：窗口、项目目录选择、外链和 widget 脚本协议；不创建或持有服务进程，关闭窗口不会停止研究服务。
- `files.rs`：使用私有发现认证读取服务授权的文件位置，二次核对根内普通文档后交系统应用打开，保留同目录相对资源。
- `skills.rs`：原生选择完整技能目录或Markdown，有限递归读取并保留空目录、相对目录及执行位，拒绝链接与特殊文件。
- `mastra.rs`：默认正式数据根、显式隔离根、私有 discovery 校验及可信页面注入；正式模式只唤醒已注册的 com.lumen.mastra，隔离根仅发现；诊断 JSON（8 MiB）和工作区二进制（25 MiB）经原生保存框写到用户选择位置。

依赖方向：main 注册窗口与命令 → mastra 解析根与发现身份 → 唯一 Mastra HTTP/SSE。唤醒在后台线程合并并节流，不运行安装脚本、不重启活实例。旧 WS、sidecar、handover 和旧工作区路径解析已移除。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
