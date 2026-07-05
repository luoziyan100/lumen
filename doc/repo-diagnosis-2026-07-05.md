# Lumen 仓库诊断报告 · 2026-07-05

> 全仓扫描 + 证据采集,非凭印象。每条结论标了依据(命令/文件/提交)。
> 方法:按 HDD 分级——问题按"爆炸半径 × 严重度"排,核心能力用证据等级(V1 复现 / V5 纯推理)标注。

---

## 0. 一句话结论

**骨架与皮都成体系了,工程纪律是这个项目最硬的资产;但最值钱的"agent 真能干活"至今停在 V5(从未跑过真实模型端到端),这是从「能演示」到「能用」唯一没跨的坎。** 其余都是可排期的债与迭代,不阻塞。

---

## 1. 现状盘点(证据)

| 维度 | 数据 | 依据 |
|---|---|---|
| agent-service 源码 | 4079 行 / 28 个测试文件 | `wc -l` |
| ui-client 源码 | 2325 行 | `wc -l` |
| 测试 | **119 / 119 绿,0 失败** | `npm test` |
| 分形文档 | 18 份 CLAUDE.md + doc 宪法(架构 / UI §3 / §3.1 图标规范) | `find -name CLAUDE.md` |
| 硬编码颜色残留 | 仅 1 处(stop-square) | grep tokens 外颜色 |
| English TODO/FIXME/HACK | **0**(仅有中文"后续/待接/暂缓"式注释) | grep |
| 工作树 | 干净,无未提交 | `git status` |

规模适中、测试全绿、文档覆盖到位——**这是有含金量的绿**(替身只在 ModelPort/HttpClient 两条缝,见 §2.1 的但是)。

---

## 2. 诊断:按严重度分级

### 🔴 P0 — 最大风险:核心能力从未经真实验证

- **事实**:M1 里程碑 fixture 是"真实线格式"但注明"真录制待 API key";119 个测试全部是 scripted / replay **替身**(架构文档 §329 / §341)。
- **判定(HDD)**:"这个 agent 真能通过真实模型完成研究任务"目前是 **V5(纯推理 + 假模型)**,不是 V1(现场复现)。**违反项目自己的架构宪法 §9**「每个里程碑至少一条真实路径 e2e,否则验收不通过」。
- **影响**:"会干活 + 产物落地"这个全部差异化的根,没有一次被真实模型证明过。沙箱/会话工作区/下载论文我都单点验过,但**"搜论文→下载→run_code 加工→写综述"完整链路跑没跑通,其实不知道**。
- **处方**:配一个 API key,跑通一条真实端到端并录成 fixture 作回归基线。这一步同时验证:真实 agent 循环、会话工作区、run_code 沙箱、下载链路、以及已接进 runtime 的人格(persona)真实行为。**这是第一优先。**

### 🟠 P1 — 架构债 / 开源阻塞

- **`@lumen/shared` 未建(真债)**:协议消息类型在 `protocol/messages.ts` + service 侧 `client/agent-client.ts` + ui 侧 `agent-client.ts` **三处手写重复**。改一个字段要人肉同步三处,迟早漂移出只在运行时才炸的 bug。→ 立包,第一版只放 messages.ts,三处改引用。低成本高回报。
- **开源历史未净**:工作树已清掉私有代理名(`cafaddf`),但 **git 历史仍有 3 个提交含该名**(`git log -S` 命中 3)。开源公开发布前需 `git filter-repo` 洗历史或以 squash 初始提交方式发布。
- **LICENSE 缺失**:计划开源却无 LICENSE 文件。MIT(最大采用)vs AGPL(防云厂商白嫖)待拍板。

### 🟡 P2 — 规范收尾(小、明确)

- **硬编码颜色仅剩 1 处**:`.stop-square` 的 `#FBFDF8`(styles.css:326)。一行 token 化即"颜色全走 token"彻底无例外。
- **字体仍走 CDN**:tokens.css 有 2 条 CDN import(googleapis + jsdelivr)。离线 / 墙内会退化系统字体(截图里已见过)。桌面版应把字体打进包(也去掉 CSP 白名单)。
- **人格线 briefs 未归档**:P0–P5 共 6 份仍躺 `briefs/active/`,但 persona **已接进 runtime**(`agent-runtime.ts:62` defaultSystemPrompt = LUMEN_PERSONA + 上下文)= 已完成。按 briefs 纪律该 mv 到 archive/ 并更新 README。
- **aura 在 WKWebView 渲染差异**:blocked 态在 Tauri 里渲染成铅笔线条,与 Chrome 不一致(遗留观察,待校准 shader 或按引擎降级)。

### 🟢 P3 — 内核增强(架构文档 §10「已知未做」)

- **流式输出**:ModelPort 无 stream、无 model_delta → 回复一次性蹦出,缺"逐段呼吸感"(设计文档 §8 要求流式)。
- **工具并行执行**:一轮多个 tool_call 目前串行。
- **spawn workspace.scoped 隔离 + compact 压缩**:worker 隔离子目录未落地。
- **全线程 token 预算**:折叠之外的整窗管理未做。
- **evidence index 已建但未接线**:去重 / 跨任务记忆(§5.7)模块 ✅ 但未接进 service 工具(M8 🟡)。
- **系统提示词输出契约**:研究判断 vs 复述、对宏大叙事的批判距离——方向已与 owner 定,写法待专门讨论(M10 尾注)。

---

## 3. 功能迭代路线(产品面)

| 功能 | 状态 | 一句话 |
|---|---|---|
| **Projects(项目)** | brief 已立(`briefs/active/projects.md`) | 会话分组 + 项目切换,治"会话列表越来越长";后端只差 list_projects/create_project 两接口 |
| **记忆开关 + 来源标注** | 讨论过,未立 brief | 会话级开卷/闭卷开关 + agent 引用旧产物时过程行标注来源(治"旧笔记干扰新话题") |
| **run_code 进阶** | run_code v1 已上 | ① Linux 沙箱(bubblewrap/landlock,现只 macOS Seatbelt)② 预装常用科学库(pandas/numpy,解"装不了第三方库")③ 搜论文顺带批量下载 |
| **composer 多行** | 未做(M7 路线图早列) | 单行 input → 多行 textarea(Enter 发送 / Shift+Enter 换行)+ 运行中禁用 |
| **M7.1 桌面分发** | app 可双击(M7 v0 ✅) | bundle node+service(现依赖用户本机 node)、tray 关窗续跑(现关窗即退) |

---

## 4. 建议的下一步顺序

1. **(P0)真实模型 e2e** —— 一步同时验证 agent 循环 + 会话工作区 + 沙箱 + 下载链路 + 人格,把最大盲区从 V5 推到 V1。**最该先做。**
2. **(P1)立 @lumen/shared 包** —— 消除协议三处重复,一天内,低成本高回报。
3. **(P2)规范收尾** —— stop-square token 化 + 人格 briefs 归档 + 字体本地化排期(半天)。
4. **(功能)Projects 或 composer 多行** —— 看你的产品优先级二选一起步。
5. **(开源前)** LICENSE 拍板 + git 历史洗私有名。

---

## 5. 亮点(值得保持的东西)

- **验证纪律没破过**:每个改动 tsc + build + 真机截图 + 测试,一次没跳;rig 里沉淀了拖拽/开屏/字符残留等永久断言。
- **文档即资产**:每次决策回写宪法与 CLAUDE.md;HDD 假设驱动方法论 skill 已装,证据分级(V1>V5)成了对账语言。
- **踩坑成知识**:Seatbelt deny-default 崩 node、Kumo 主题层序、light-dark 被工具链降级、SSH 断连留孤儿 Chrome——都写进了注释与记忆,不会再踩第二次。

---

*采集方法:`wc`/`grep`/`git log`/`npm test` 在真实仓库执行;测试 119/119 为本次实跑结果,非引用。诊断人:Claude(远程编程智能体),按 HDD 分级。*
