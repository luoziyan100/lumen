# src-tauri/ — Mastra 桌面薄壳
> L2 | 父级: ../CLAUDE.md

原生层只提供窗口、受信连接和用户文件动作。Agent、运行状态与存储由 Mastra 服务管理，壳不持有服务进程。

```text
src-tauri/
├── src/
│   ├── main.rs
│   ├── mastra.rs
│   ├── files.rs
│   ├── skills.rs
│   └── CLAUDE.md
├── tauri.conf.json
├── Cargo.toml / Cargo.lock
├── build.rs
└── icons/
```

- `src/main.rs`：1160×800 原生窗口、项目目录选择、系统浏览器外链、widget 脚本注册与 URI 协议；macOS 关窗隐藏、Dock 重开显示，Cmd+Q 只退出窗口进程。
- `src/mastra.rs`：默认 `~/.lumen-mastra`，参数 `--mastra-data-root` 优先于 `LUMEN_MASTRA_HOME`；私有发现验证后只向可信顶层页面注入 HTTP 身份，失败显示重试入口。
- `src/files.rs`：系统文档打开先向受信服务验证项目文件归属，二次确认实际路径，禁止页面传入任意宿主路径。
- `src/skills.rs`：原生选择完整技能包，保留脚本、资源和空目录相对结构，32 MiB/4096项/32层限制且拒绝符号链接。
- `src/CLAUDE.md`：原生职责与依赖地图。
- `tauri.conf.json`：应用身份与最小 CSP；脚本仅 self/lumenwidget，无 unsafe-inline/eval；服务连接仅本机 HTTP。
- `Cargo.toml` / `Cargo.lock`：Tauri、rfd、serde、base64 0.22和reqwest 0.13；二进制名Lumen，reqwest只连私有发现的本机服务，不跟随重定向或系统代理。
- `build.rs`：Tauri 构建元数据。
- `icons/`：用户提供的飞鸟/星芒水彩图标，全幅1024母版派生桌面各尺寸与ICNS/ICO，详见局部地图。

正式入口发现失败时只对已注册的 `com.lumen.mastra` 执行不带 `-k` 的 kickstart，不安装服务、不杀活实例。显式隔离根不会唤醒正式服务。启动、聚焦和重开共用后台发现节流，UI 重试始终读取当前私有令牌。

`save_diagnostic_file` 保存有界诊断 JSON（8 MiB）；`save_workspace_file` 先校验 base64 编码长度，再解码并限制 25 MiB。二者共用原生对话框，只写用户选择位置、取消不落盘，不接受目标绝对路径。HTML/widget 沿用网页沙箱与 lumenwidget 脚本通道。

2026-09-19：默认入口切换 Mastra，退役旧 WS、sidecar、launchd 安装/交接及旧工作区路径解析。删除前源码备份及摘要位于 `~/.lumen-mastra-preview/deployment/retired-source/desktop-default-20260919T041409Z/`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-09-20：应用图标替换为用户提供的水彩飞鸟与金色星芒，去除展示稿外围白底；系统合成验证后改为不透明全幅母版，避免重复圆角底板与内缩。应用身份保持com.lumen.research。
