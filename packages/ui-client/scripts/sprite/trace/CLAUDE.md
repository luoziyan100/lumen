# trace/ — 原生调试构建取证
> L2 | 父级: ../CLAUDE.md

- `native.rs`：仅由 debug_assertions 编译，显式环境变量启用注入及日志命令，正式包不存在此模块。
- `inject.js`：观察桌面 React 提交后的真实状态；起点由 native.rs 在主窗状态进入原生转发时记录；时间只留在验收记录，不进入产品协议。

依赖方向：调试入口 → 原生转发/初始化脚本 → 真实 DOM → 独立 JSONL；不生成业务状态、不连接研究服务。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
