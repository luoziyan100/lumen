# ui-client — Mastra 研究工作台与 Tauri 薄壳

> L2 | 父级: ../../CLAUDE.md

React 19 + TypeScript 5.9 + Vite 7 + Tauri 2。思考/过程视觉使用原generative-loaders 0.1.1与thinking-orbs 0.2.0，输入卡光边使用原border-beam 1.3.0。恢复迁移前 titlebar/sidebar/chat/composer/reader 与外观交互，输入卡左上角添加菜单和双卡工作目录复用旧结构，唯一应用入口连接 Mastra HTTP/SSE；消息、运行状态与子任务来自服务原生接口，界面不维护另一套 agent 循环。

```text
src/
├── main.tsx                 # 选择独立的主窗/桌面根；仅主窗发现 Mastra 并装配 StudioApp
├── mastra/                  # 连接、studio 外壳（主题/白板/材料/精灵）、对话、阅读器、技能、角色与诊断
├── assets/                  # 精灵五表情、全身母版与按显示尺寸派生的运行素材
├── components/              # Markdown、PDF、HTML、图表、外链与共享卷帘交互
├── appearance/              # 外观偏好解析、持久化与整窗应用
├── copy/                    # 产品文案
├── mermaid/                 # 图表语法、主题颜色、测量与缩放
├── scroll/                  # 阅读器与图表共享的滚动诊断
├── shell/                   # 原生文件夹选择（S2 起无调用方；P0 保留不删，去留由合并时决定）
├── sourceCite.ts            # 引用 URL 解析与站点归并
├── openExternal.ts          # 确认后的外链交给系统浏览器
├── trustedHosts.ts          # 用户允许跳过确认的域名
└── *.css                    # 设计 token、控件映射与全局样式
src-tauri/                  # 原生服务发现、窗口、文件选择与受限网页能力
scripts/                    # 主题合同与精灵隔离验收；原生取证仅调试构建
tests/                      # 原生 HTTP/SSE 客户端与保留渲染算法回归
```

## 边界与配置

- 入口：`mastra/studio/StudioApp.tsx` 是桌面唯一工作台——照原型 v7 骨架的圆角面板（8px 外边距与间距、50px 同线头部、14px 同一左缘、四级字阶）：左栏主题与状态灯、中栏头部只有居中分段视图（主题名进窗口标题）（P0 只有白板可用，沉淀/概念图/灵感/全部如实占位）与同行头部的原件分屏（可拖分隔条，白板 ≥360、阅读器 ≥420，先压阅读器）或铺满中栏（Esc 还原）、右栏「素材」、对话精灵（头像可拖到整个窗口任意位置并记住，浮窗从头像柔和展开/缩回，也可停靠成面板）；左右栏可收起到宽 0（⌘B / ⌘⌥B，记在 localStorage）。白板对人只读；刷新靠对话里白板工具完成信号 + 运行中 ETag 兜底。S2 过渡入口 TopicsEntry、Files 目录轨与 workspace/ 已在 S4 退场（备份 `~/Workspace/tmp/studio-retired/2026-11-12-S4/`，含 SHA256SUMS）；旧 WorkspaceApp 等在 S2 退场（`…/2026-11-12-S2/`）。
- `mastra/data/` 消费服务接口（会话身份 `topicId:taskId`；附件上传进 `/lumen/library` 并引用到主题）；工作区文件和历史都从服务读取，不拼装旧目录或重放旧 WS 事件。
- `components/` 保留与运行时无关的阅读能力；HTML 走隔离 widget iframe，Markdown 外链走统一确认出口。
- `components/icons.tsx` 是业务图标唯一入口，几何与动效来自 `yan-design-system`(icons/glyphs.ts、icons/motion.css)：自绘纯线条、currentColor、悬停做物件动作(doc/ui-design.md §3.1)，16/18/20三档覆盖行内、按钮和主导航；管理三点与折叠箭头分工，文件类别用轮廓表达，禁止字符和 CSS 尺寸例外。
- `main.tsx` / `vite.config.ts` / `src-tauri/src/mastra.rs` 负责发现服务。冷启动失败展示错误并进行有界退避发现；工作台已经打开后，短暂探测失败保留当前连接，不卸载界面。成功换端口/令牌时替换连接并补取历史，不启动另一个运行时。
- `package.json` 声明浏览器与桌面命令；`tsconfig.json` 检查现役源码；`vite.config.ts` 提供本机开发发现；`index.html` 是网页宿主。
- 服务发现：浏览器开发（vite）与桌面 `mastra.rs` 都默认 `~/.lumen-studio`，桌面只唤醒 `com.lumen.studio`，不连旧形态 `~/.lumen-mastra`；桌面应用为 `Lumen.app`（bundle id `com.lumen.studio`；S5 时叫 Lumen Studio.app，2026-11-12 合入 main 后改回 Lumen）；参数或 `LUMEN_MASTRA_HOME` 保留隔离预览；旧入口和 WS 回退已删除。
- 通用语义变量(表面、墨色、强调、材质、字体、字阶、间距、圆角、阴影、动效)来自 `yan-design-system`(`~/Workspace/Projects/yan-design-system`，`file:` 依赖)，main.tsx 依次引入 fonts/tokens/base 与图标动效；本包 `tokens.css` 只放皮肤背景槽、炫光/aurora 装饰与布局尺寸；`theme-celadon.css` 让 Kumo 实色控件同源换肤并对齐内置 Select 图标，`kumo.css` 加载控件，`styles.css` 消费语义变量定义布局与图标对齐，不重缩放图标。
- `styles.css` 只保留现役布局、卷帘、消息、输入卡、阅读器和 Mermaid/widget 样式，新外壳样式在 `mastra/studio/studio.css`；退役侧栏、附件抽屉、Todo/来源/诊断/HUD 规则已清除。
- 默认外观「清透」：侧栏/标题栏为半透明窗框、正文与工作区为实色内容面，细线分隔不浮卡；桌面端 `data-vibrancy` 下整窗透明，窗框透出 macOS 系统毛玻璃。
- 玻璃反光、边缘和背景饱和度统一随材质 token；纸面关闭面板模糊、按钮扫光及输入卡彩边，面板与浮动跳转按钮使用实色，保留静态表面层次。背景模糊仅处理画布伪层，不模糊正文；浅色遮罩提亮，深色遮罩压暗。
- `components/disclosure/` 共用原卷帘时序与三层容器；`styles.css` 的开合/错峰只命中当前层，父级展开不得覆盖已收起的子会话。

## 开发纪律

执行 `npm run typecheck -w @lumen/ui-client`、`npm test -w @lumen/ui-client`、`npm run build -w @lumen/ui-client`；原生构建与安装仍须在实际桌面验证。Node 回归不证明 WebKit 交互通过。

界面颜色、阴影与字体消费 token，控件沿用 Kumo；PDF 渲染保持 pdfjs-dist 4.10.38，避免已知 WebKit ESM 回归。修改界面后同步文案、局部地图与文件契约。

## 迁移记录

2026-09-19：旧 WS 客户端、ChatItem reducer、旧项目/会话编排与旧组件退役。退役原文件按相对路径保存在部署备份中并逐项校验 SHA-256；历史测试矩阵保留历史含义，不宣称迁移后自动覆盖。

依赖收口：移除无现役引用的 shaders-react；Mermaid 固定 11.16.1。2026-09-20按原源码恢复思考/工具过程展示，重新接入 generative-loaders 0.1.1 与 thinking-orbs 0.2.0，分别负责等待光圈和工具状态球。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

桌面精灵：主窗口保留唯一会话订阅，经原生缓存投影到独立透明窗口；关窗/最小化后显示桌面形态，恢复后回到应用内。SpriteFigure 是两形共用、可独立替换的绘制边界，原生层独占生命周期与桌面位置。浏览器和原生验收入口见 scripts/CLAUDE.md。
