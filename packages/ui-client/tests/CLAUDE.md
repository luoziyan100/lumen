# tests/ — Mastra 客户端与阅读领域回归

> L2 | 父级: ../CLAUDE.md

`node:test` 验证真实 HTTP/SSE 消费与独立渲染算法。`npm test` 先检查类型；Node 通过不代表已装桌面应用的 WebKit 用户路径通过。

卷帘回归复用导航/长消息用例：收起保留同一 DOM、立即屏蔽焦点，长文本退出后恢复预览，快速反向操作撤销旧展开帧；实际动画仍由桌面安装后核对。

```text
tests/
├── mastra-*.test.ts         # 新服务客户端边界
├── markdown-*.test.ts       # 正文与数学
├── mermaid-*.test.ts        # 图表算法与宿主
├── widget-*.test.ts         # 网页沙箱输入与主题
├── appearance-resolve.test.ts
├── source-cite.test.ts / scroll-debug.test.ts
└── fixtures/               # 合成阅读材料
```

- `mastra-feed.test.ts`：真实 HTTP/SSE 的快照/流竞争、旧连接迟到、重连、原生用户消息与分页历史；过期选择不得创建线程，专家用量在原生 SSE 后保留，Progress 分列主/子/合计；真实原生快照中保留的 completed 工具不得显示执行中，失败工具也不冒充运行态；实际 HTTP 端口轮换后触发重新发现并恢复原会话，旧订阅迟到错误不能再次发起恢复；消息合并覆盖顺序稳定增量快路径与乱序历史排序。
- `mastra-diagnostics.test.ts`：真实 React/HTTP 的标注保存/评估互斥、失败留稿、切项目迟到隔离、持久结果和无工具模型请求；同时覆盖 trace、导出/离线查看、跨会话拒绝、有界文件与采集热关闭。
- `mastra-files.test.ts`：文件引用/当前稿路径边界；真实HTTP目录投影验证隐藏加载、新产物通知、切身份首帧隔离；真实工作目录轨的分组/卷帘折叠/打开交互，阅读内容更新与共享批量上传失败提示；不可读/残缺/超大附件不发送请求，完整上传保持字节和名称，失败展示服务原因。
- `mastra-transcript.test.ts`：真实消息组件的历史附件受控打开、内嵌图片预览、长正文折叠、剪贴板回退与轮次焦点/跳转；不把 DOM 验证视为 WebKit 验收。
- `mastra-process.test.ts`：原生reasoning与工具投影、定稿隐藏成功过程、未完成保留、六步窗口与流式手动开合；不展示redacted数据和原始JSON。
- `mastra-composer.test.ts`：欢迎页输入/附件不提前建会话、准备失败留稿并重试，切项目后已确认提交不改目标或抢回页面，斜杠技能准备真实会话但不发送研究，准备期间新增文本/附件不进入已确认快照、不同服务同名项目草稿隔离；输入高度增长/上限/收缩与草稿恢复重算，真实Conversation的松开跟随/近底上滑/轮次跳转/回到最新；真实 React Composer 与 HTTP/Mastra 验证草稿/上传竞赛恢复、提交期间当前稿冻结且不串会话、StrictMode 重挂载、斜杠技能过滤和键盘激活；选择技能或空结果回车不误发模型请求；Conversation/Specialists 轮询不重叠且完成后显示最新状态。
- `stick-scroll.test.ts`：滚动判定的上滑离钉、程序近底不恢复、塌缩不吸回、手势窗内不追高。
- `connection-hold.test.ts`：已连接后的发现失败保留连接，冷启动失败和成功的新令牌仍替换。
- `mastra-appearance.test.ts`：真实恢复后的皮肤面板点击、偏好持久化、系统明暗变化和卸载订阅清理；模型ID逐行增减不提交、保存保留活动模型/凭证，删除只发送删除请求。
- `appearance-resolve.test.ts`：外观偏好与系统主题合成规则。
- `markdown-cache.test.ts`：禁止跨会话共享携带回调的 Markdown React 树缓存。
- `markdown-math.test.ts`：数学定界符归一与真实 KaTeX SSR，代码区阻止跨区配对。
- `mermaid-layout.test.ts`：固有尺寸政策与真实 Mermaid ELK 配置。
- `mermaid-measure-host.test.ts`：测量 host 的宽度分桶与缓存提交时机。
- `mermaid-sanitize.test.ts`：SVG 主题净化与可读性边界。
- `mermaid-syntax.test.ts`：图表语法归一与极宽 LR 方向保持。
- `mermaid-zoom.test.ts`：阅读器图表缩放几何规则。
- `scroll-debug.test.ts`：默认关闭、有界缓冲与标量日志契约。
- `source-cite.test.ts`：URL、正文来源段、工具来源与站点归并的纯算法；不再包含旧 reducer 集成。
- `widget-parse.test.ts`：show-widget 围栏分段和不完整输入处理。
- `widget-theme.test.ts`：沙箱主题变量映射与明暗继承。
- `fixtures/`：真实渲染内核使用的合成材料，见局部地图。
- `mastra-create-project.test.ts`：真实创建卡验证创建失败保留草稿、源目录绑定失败保留项目身份，修改路径重试不重复创建。
- `mastra-navigation.test.ts`：真实 HTTP 跨项目分页与侧栏折叠持久化、四条预览/全局置顶/最近二十条导航、右键菜单目标、CommandPalette 选择与手动未读不会被已发自动确认覆盖的真实HTTP顺序。
- `helpers/`：只为真实组件测试加载 TSX，不替换客户端、组件或服务。

模型失败回归：`mastra-feed.test.ts` 通过真实 HTTP/SSE 触发 provider 400，验证错误跨 `agent_end` 补取、连接失败与恢复持续可见，同一会话下一轮开始后才清除。

2026-09-19：旧 WS、ChatItem、旧 React hook/组件测试与未接线的旧 WebKit 占位入口随源码退役，原文件已做字节级备份。历史 F 合同矩阵仅作设计历史，不自动转移覆盖或验收结论到 Mastra。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
