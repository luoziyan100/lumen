# ui-client — Mastra 研究工作台与 Tauri 薄壳

> L2 | 父级: ../../CLAUDE.md

React 19 + TypeScript 5.9 + Vite 7 + Tauri 2。思考/过程视觉使用原generative-loaders 0.1.1与thinking-orbs 0.2.0，输入卡光边使用原border-beam 1.3.0。恢复迁移前 titlebar/sidebar/chat/composer/reader 与外观交互，输入卡左上角添加菜单和双卡工作目录复用旧结构，唯一应用入口连接 Mastra HTTP/SSE；消息、运行状态与子任务来自服务原生接口，界面不维护另一套 agent 循环。

```text
src/
├── main.tsx                 # 发现 Mastra 服务并装配研究工作台
├── mastra/                  # 连接、对话、项目、技能、角色、文件与诊断
├── components/              # Markdown、PDF、HTML、图表、外链与共享卷帘交互
├── appearance/              # 外观偏好解析、持久化与整窗应用
├── copy/                    # 产品文案
├── mermaid/                 # 图表语法、测量、净化与缩放
├── scroll/                  # 阅读器与图表共享的滚动诊断
├── shell/                   # 原生文件夹选择
├── sourceCite.ts            # 引用 URL 解析与站点归并
├── openExternal.ts          # 确认后的外链交给系统浏览器
├── trustedHosts.ts          # 用户允许跳过确认的域名
└── *.css                    # 设计 token、控件映射与全局样式
src-tauri/                  # 原生服务发现、窗口、文件选择与受限网页能力
scripts/                    # 青瓷主题变量合同检查
tests/                      # 原生 HTTP/SSE 客户端与保留渲染算法回归
```

## 边界与配置

- `mastra/data/` 消费服务接口；工作区文件和历史都从服务读取，不拼装旧目录或重放旧 WS 事件。
- `components/` 保留与运行时无关的阅读能力；HTML 走隔离 widget iframe，Markdown 外链走统一确认出口。
- `main.tsx` / `vite.config.ts` / `src-tauri/src/mastra.rs` 负责发现服务。冷启动失败展示错误并进行有界退避发现；工作台已经打开后，短暂探测失败保留当前连接，不卸载界面。成功换端口/令牌时替换连接并补取历史，不启动另一个运行时。
- `package.json` 声明浏览器与桌面命令；`tsconfig.json` 检查现役源码；`vite.config.ts` 提供本机开发发现；`index.html` 是网页宿主。
- 服务发现默认读取 `~/.lumen-mastra`，参数或 `LUMEN_MASTRA_HOME` 保留隔离预览；旧入口和 WS 回退已删除。
- `tokens.css` 是颜色、字体与阴影真源；`theme-celadon.css`、`kumo.css` 与 `styles.css` 负责控件映射和布局。
- `styles.css` 只保留现役布局、卷帘、消息、输入卡、阅读器、工作区和 Mermaid/widget 样式；退役侧栏、附件抽屉、Todo/来源/诊断/HUD 规则已清除。
- `components/disclosure/` 共用原卷帘时序与三层容器；`styles.css` 的开合/错峰只命中当前层，父项目展开不得覆盖已收起的子会话。

## 开发纪律

执行 `npm run typecheck -w @lumen/ui-client`、`npm test -w @lumen/ui-client`、`npm run build -w @lumen/ui-client`；原生构建与安装仍须在实际桌面验证。Node 回归不证明 WebKit 交互通过。

界面颜色、阴影与字体消费 token，控件沿用 Kumo；PDF 渲染保持 pdfjs-dist 4.10.38，避免已知 WebKit ESM 回归。修改界面后同步文案、局部地图与文件契约。

## 迁移记录

2026-09-19：旧 WS 客户端、ChatItem reducer、旧项目/会话编排与旧组件退役。退役原文件按相对路径保存在部署备份中并逐项校验 SHA-256；历史测试矩阵保留历史含义，不宣称迁移后自动覆盖。

依赖收口：移除无现役引用的 shaders-react；Mermaid 固定 11.16.1。2026-09-20按原源码恢复思考/工具过程展示，重新接入 generative-loaders 0.1.1 与 thinking-orbs 0.2.0，分别负责等待光圈和工具状态球。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
