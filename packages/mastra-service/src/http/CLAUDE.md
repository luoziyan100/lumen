# http/
> L2 | 父级: ../CLAUDE.md

框架 HTTP 能力由产品显式开放。Controller 仅消费已绑定的任务会话，不能通过原生管理路由改变 Lumen 的工作区归属。

- `native-routes.ts`：白名单开放消息、状态、SSE 与交互恢复；历史读取只验证固定 project:task 归属，状态/订阅/执行才绑定会话，避免读历史写配置或改排序时间；拒绝 scope、身份重绑定及其他执行入口。

- `snapshot.ts`：读取原生 DisplayState 并转换 Map，以官方 SSE 的 wire 形状恢复 UI；独立附加专家累计 childTokenUsage，不改写原生主用量。
- `suspensions.ts`：拦截官方问答回复路径，校验持久快照并只接收一次；未知、取消或重复回复明确返回 409 和可展示原因，模型执行仍交给原生 Session。
- `skills.ts`：产品技能目录、激活、工作区/完整目录上传安装和卸载；上传仅含用户所选相对文件，不开放宿主任意目录读取。
- `diagnostics.ts`：目录归属验证后的 trace/标注/导出与只读离线检查；显式 evaluate 仅运行隔离录制回放或当前模型无工具评估，离线包打开本身不触发执行。
- `legacy-diagnostics.ts`：旧执行证据列表/详情；当前目录授权、迁移source映射和SHA256校验通过才读取，独立标为只读legacy-v1。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
