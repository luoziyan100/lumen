# tests/ — Mastra 客户端与阅读领域回归

> L2 | 父级: ../CLAUDE.md

`node:test` 验证真实 HTTP/SSE 消费与独立渲染算法。`tests/helpers/tsx-loader.mjs` 让真实组件测试解析本地扩展名与 TSX，并把图片导入折成文件 URL（Vite 里是构建产物 URL），组件源码不必为测试改写导入。`npm test` 先检查类型；Node 通过不代表已装桌面应用的 WebKit 用户路径通过。

卷帘回归复用导航/长消息用例：收起保留同一 DOM、立即屏蔽焦点，长文本退出后恢复预览，快速反向操作撤销旧展开帧；实际动画仍由桌面安装后核对。

```text
tests/
├── mastra-*.test.ts         # 新服务客户端边界
├── studio-app.test.ts       # 白板工作台外壳（S4）
├── library-titles.test.ts   # 素材标题/链接副行、阅读器标题、系统打开只交条目 id、保存补扩展名
├── studio-chrome.test.ts    # 素材搜索与链接短写、视图导航图标与紧凑态
├── markdown-*.test.ts       # 正文与数学
├── mermaid-*.test.ts        # 图表算法与宿主
├── widget-*.test.ts         # 网页沙箱输入与主题
├── icons.test.ts            # 自绘图标结构合同
├── pdf-fit.test.ts          # PdfViewer 按宽适配（真实 pdf.js）
├── sprite-face.test.ts      # Expression cadence, hidden/reduced scheduling and timer disposal
├── sprite-place.test.ts     # 精灵位置模型（锚点、缩放夹取、迁移、象限、动画参数）
├── sprite-move.test.ts      # 精灵交互（拖与点、不重渲染、浮窗带锚点、倒放、减弱动效）
├── stream-pulse.test.ts     # 「正在说话」判定（增量/回落/换消息）
├── sprite-desktop.test.ts   # 原生投影负载和桌面出入动效参数
├── sprite-view.test.ts      # A04 compact/Retina desktop source selection, shared-driver ticks and lifecycle, plus real HTTP/SSE continuity
├── appearance-resolve.test.ts
├── source-cite.test.ts / scroll-debug.test.ts
└── fixtures/               # 合成阅读材料
```

- `mastra-feed.test.ts`：真实 HTTP/SSE 的快照/流竞争、旧连接迟到、重连、原生用户消息与分页历史；过期选择不得创建线程，专家用量在原生 SSE 后保留，Progress 分列主/子/合计；真实原生快照中保留的 completed 工具不得显示执行中，失败工具也不冒充运行态；实际 HTTP 端口轮换后触发重新发现并恢复原会话，旧订阅迟到错误不能再次发起恢复；消息合并覆盖顺序稳定增量快路径与乱序历史排序；剥离 display_state_changed 后仅凭 1.82 message_update 增量仍拼出流式正文（004 为反向镜像）。
- `mastra-diagnostics.test.ts`：真实 React/HTTP 的标注保存/评估互斥、失败留稿、切主题迟到隔离、持久结果和无工具模型请求；同时覆盖 trace、导出/离线查看、跨会话拒绝、有界文件与采集热关闭。
- `mastra-files.test.ts`：文件引用/当前稿路径边界；真实 DocumentReader 读资料库条目（不需会话身份）与工作区文件，运行中按 ETag 检查、304 不重建沙箱、内容变了才换，关闭回调；不可读/残缺/超大附件不发送请求，完整上传保持字节和名称，失败展示服务原因。（S4 前的工作目录轨用例随 Files/workspace 退场，原文件备份于 studio-retired/2026-11-12-S4/partial/）
- `library-titles.test.ts`：真实 StudioApp + 真实 HTTP 服务与资料库，arXiv 在研究网络边界是可控桩：摘要页链接经服务端资料库接口收进主题（右栏不再加链接）后素材主行是 API 标题且 title 给全名、副行只有链接短写且 title 给完整 URL、行里只有这两段文字（chrome C6）、阅读器头部用新标题；在 `__TAURI_INTERNALS__` 边界记录原生调用：系统打开只交条目 id 给 `open_library_item`、保存仍调 `save_workspace_file` 且文件名补 `.pdf`；pdf.js 用真实 worker。省略号渲染、明暗与原生预览不在这里宣称。
- `studio-chrome.test.ts`：`filterMaterials`（标题/链接、大小写、首尾空格、中文子串、无匹配、空查询原样）、`shortLink`（arXiv 摘要页、带路径与查询、末尾斜杠、无链接）、`navFits` 边界；`ViewNav` 五项图标几何与 16/currentColor、aria-label 恒在、完整宽度副本不进可访问树，放不下只留图标并补 title、展开按钮收走后靠子节点变化重量、头部宽 0 不切换（宽度在元素尺寸边界注入；真实排版在浏览器断言）。
- `studio-app.test.ts`：真实 StudioApp + 真实 HTTP 服务与 Controller：模型经真实 board_draw 画出文字/梯子/表格/小部件四块并渲染（雾线、你在这里、断点、留给你猜、出处签与 AI 推断、小部件名额）；ETag 兜底轮询被截住时，运行中第一块写完白板即刷新（证明靠工具完成信号）；对话里只有白板卡片、点卡跳块；主题运行时新对话禁用并说明（R1），结束后恢复；视图导航五项都有图标、aria-label 与是否开放，占位如实；素材行只有标题（无链接时没有副行、不标谁找来的）并分屏读原件；上传在素材标题行、收起之前，右栏没有任何加链接入口；搜索即时过滤（首尾空格、中文子串）、无匹配如实说、Esc 清空；左下角只有设置，设置的专家分页经真实服务停用/启用/重载，运行中写入被服务拒绝并显示、状态不变；出处签打开原件；精灵停靠/拖动/收起写入 localStorage；面板与原文：⌘B / ⌘⌥B 收放并写入 localStorage、收起的栏 inert、展开按钮的 aria 与带快捷键的 title、分屏时展开按钮落在阅读器头、铺满时白板保持挂载、Esc 回分屏而输入框里的 Esc 不抢、关阅读器不留铺满、页面没有 ws-tag。
- `sprite-desktop.test.ts`：四态协议拒绝非法序号/时间与未知状态；桌面过渡只动合成属性、减弱动效只淡120ms。生命周期、位置与菜单直接测 src-tauri 的运行模型，避免另造镜像。
- `sprite-place.test.ts`：精灵位置纯函数——最近边选择与来回换算不漂、松手先夹进 8px、窗口缩小夹取/放大回原位、旧 x/y/w/h 迁移与非法字段回退、默认位置与上一版一致、4px 阈值、象限决定浮窗方向与夹取、拖浮窗反算锚点再展开得到同一个浮窗、Alt+方向键 16px 夹取、展开/收起/减弱动效参数只有 transform 与 opacity。
- `sprite-move.test.ts`：真实 useSpriteMove + 假 Element.animate（假计时器逐帧推进）：≤4px 打开、>4px 拖动只写 transform 且不重渲染、拖后 click 即使迟到也不打开（下一次按下清标记）、pointercancel 后与键盘激活从不被吞（复核 R1）、松手才写锚点；pointercancel 停在最后位置与视口夹取；拖浮窗标题栏带着锚点走；Alt+方向键；展开中途收起倒放同一组动画不叠第二层、收起中点头像又倒回；减弱动效 120ms 只淡；卸载取消动画。
- `pdf-fit.test.ts`：真实 PdfViewer + pdf.js（Node 同进程 worker）读按规范拼的两页 Letter PDF：不传 fit 初始 130% 且宽度变化不改；传 fit 按宽适配（显示宽度封顶 960）、宽度变化重新适配、懒渲染的页也跟着缩放；手动放大后停止适配，「适配宽度」回到适配。
- `mastra-transcript.test.ts`：真实消息组件的资料库附件（只认 itemId）受控打开、内嵌图片预览、长正文折叠、剪贴板回退与轮次焦点/跳转；不把 DOM 验证视为 WebKit 验收。
- `mastra-process.test.ts`：原生reasoning与工具投影、定稿隐藏成功过程、未完成保留、六步窗口与流式手动开合；不展示redacted数据和原始JSON。
- `mastra-composer.test.ts`：（以主题身份；旧 WorkspaceApp 导航用例随外壳在 S2 退场）欢迎页准备失败留稿并重试，切主题后已确认提交不改目标或抢回页面，斜杠技能准备真实会话但不发送研究，准备期间新增文本/附件不进入已确认快照、不同服务同名主题草稿隔离；输入高度增长/上限/收缩与草稿恢复重算，真实Conversation的松开跟随/近底上滑/轮次跳转/回到最新；真实 React Composer 与 HTTP/Mastra 验证草稿/上传竞赛恢复、提交期间当前稿冻结且不串会话、StrictMode 重挂载、斜杠技能过滤和键盘激活；选择技能或空结果回车不误发模型请求；Conversation/Specialists 轮询不重叠且完成后显示最新状态；进行中专家任务挂输入坞上方、完成即移除，专家目录不在对话流内。
- `stick-scroll.test.ts`：滚动判定的上滑离钉、程序近底不恢复、塌缩不吸回、手势窗内不追高。
- `connection-hold.test.ts`：已连接后的发现失败保留连接，冷启动失败和成功的新令牌仍替换。
- `mastra-appearance.test.ts`：真实设置窗口与外观宿主验证系统变化切换实际明暗基线，纸面/玻璃皮肤的颜色与材质经本机保存恢复；设置有模型、研究偏好、专家和外观四个分类，服务返回预算也不产生编辑入口；研究忙碌时分类可切换、配置写入仍受限、浅色换肤不提交服务；另覆盖卸载订阅、模型ID逐行增减不提交、保存保留活动模型/凭证、删除只发送删除请求。
- `appearance-resolve.test.ts`：默认清透明暗除淡蓝强调外逐项等于设计系统主题值表，强调墨作文字/托底文字不低于 4.5:1 且其他皮肤不补墨色、v1 偏好迁移、真实明暗与系统模式基线、浅色皮肤/玻璃纸面材质、跨明暗补丁隔离、原语白名单及别名级联。
- `icons.test.ts`：全部导出图标、文件类别与技能图标的24网格、currentColor 描边、无填充、几何不出画布，几何均有入口、尺寸档与镜像生效；CollapseIcon 与 ExpandIcon 同尺寸档、同一对动效部件。
- `markdown-cache.test.ts`：禁止跨会话共享携带回调的 Markdown React 树缓存。
- `markdown-math.test.ts`：数学定界符归一与真实 KaTeX SSR，代码区阻止跨区配对。
- `mermaid-layout.test.ts`：固有尺寸政策与真实 Mermaid ELK 配置。
- `mermaid-measure-host.test.ts`：测量 host 的宽度分桶与缓存提交时机。
- `mermaid-theme.test.ts`：真实明暗基线 token 的调色板、模型颜色剥离与语义 class 主题定义。
- `mermaid-block.test.ts`：真实组件与真实 mermaid.parse 的失败卡，「请模型修正」发出含原图与错误的普通消息，同会话同图(两处/重挂载)只发一次、换会话可再发；流式/无会话出口不出现；按钮与 alert 不在 role=img 内；缓存上限 64。
- `mermaid-syntax.test.ts`：图表语法归一与极宽 LR 方向保持。
- `mermaid-zoom.test.ts`：阅读器图表缩放几何规则。
- `scroll-debug.test.ts`：默认关闭、有界缓冲与标量日志契约。
- `source-cite.test.ts`：URL、正文来源段、工具来源与站点归并的纯算法；不再包含旧 reducer 集成。
- `widget-parse.test.ts`：show-widget 围栏分段和不完整输入处理。
- `widget-theme.test.ts`：暗壳保持固定浅色文档岛；浅玻璃内容岛从实色伴生取底并沿用深墨，透明壳面不泄漏到 iframe；保留明暗识别与 receiver fillHeight 滚动合同。
- `fixtures/`：真实渲染内核使用的合成材料，见局部地图。
- `helpers/`：只为真实组件测试加载 TSX，不替换客户端、组件或服务。

模型失败回归：`mastra-feed.test.ts` 通过真实 HTTP/SSE 触发 provider 400 与非标准 403 错误体（显示 reason/状态码/错误码而非状态文字），验证错误跨 `agent_end` 补取、连接失败与恢复持续可见，同一会话下一轮开始后才清除。

2026-09-19：旧 WS、ChatItem、旧 React hook/组件测试与未接线的旧 WebKit 占位入口随源码退役，原文件已做字节级备份。历史 F 合同矩阵仅作设计历史，不自动转移覆盖或验收结论到 Mastra。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
