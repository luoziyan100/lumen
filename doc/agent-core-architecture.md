# Lumen 架构

> 本文描述当前实现。系统由两个包组成:`agent-service`(无头 Node 服务)与 `ui-client`(React 薄客户端,运行于浏览器或 Tauri 原生壳),二者以 WebSocket + JSON 通信。

## 总览

```
┌─ macOS 原生壳(Tauri)─── 或 ─── 浏览器 ─────┐
│  ui-client · React + Vite                    │
│  三栏:项目树(会话) / 对话 / 工作区+阅读器   │
└───────────────┬──────────────────────────────┘
                │ WebSocket(JSON · LumenClient)
┌───────────────┴──────────────────────────────┐
│  agent-service · Node                        │
│                                              │
│  protocol/   WS 服务:任务·事件订阅·资产·设置 │
│  runtime/    任务生命周期:建线程→跑内核→发事件│
│  core/       agent 内核:循环·线程·工具·预算  │
│  agents/     系统提示词与 worker 角色         │
│  tools/      研究工具 + 环境工具              │
│  adapters/   模型适配:Anthropic / OpenAI 兼容 │
│  storage/    SQLite 事件溯源·设置·用量计量    │
│  workspace/  项目工作区(真实文件系统)       │
└───────────────┬──────────────────────────────┘
                │ HTTPS
      DeepSeek / Claude / 任意 OpenAI 兼容端点
```

## 内核(core/)

一条铁律贯穿全部设计:**agent 是一条只增不减的消息线程上的循环;每个 tool_call 的结果必须回灌同一条线程**——模型每一轮都看见自己行为的后果,任何动作都不会"凭空消失"。

- **`thread.ts` · Thread** — 状态载体。`append` 是唯一写入口;`forModel()` 产出给模型的视图:超长的老 `tool_result` 内容折叠为占位符,但保留该消息的存在(工具确实执行过),最近 N 条豁免。生产默认:单条超 8000 字符折叠、豁免最近 6 条。
- **`loop.ts` · runAgent** — 唯一的循环。模型走一步 → 顺序执行其 tool_calls → 结果逐条回灌线程 → 下一轮把最新线程喂回模型。模型不再调用工具即为回复,状态 `done`;超步数/超时 `exhausted`;取消 `aborted`;模型层错误 `error`。工具抛错不打断循环——错误文本作为 tool_result 回灌,模型自行恢复。
- **`spawn.ts`** — sub-agent 是对 runAgent 的递归调用(同一内核)。worker 在自己的子线程里干活,父线程只收它的最终回复。
- **`limits.ts`** — 预算原语:maxSteps(默认 30)/ maxDepth(默认 3)/ 可选墙钟秒数。
- **`model-port.ts` · ModelPort** — 内核对模型的全部认知:`chat(messages, tools, signal)`,提供商细节到不了内核。
- **`guard.ts` · withGuard** — 工具派发的横切守卫:统一超时兜底 + 遥测钩子。
- **`tool.ts`** — Tool 接口:`spec`(名字/描述/参数 schema)+ `run(args, ctx, signal) → { llmContent }`。

## 工具(tools/)

- **研究**:`extract_pdf`(PDF → 文本,产物进会话 `cache/`)、`search_papers` / `get_citations`(OpenAlex 检索与引文,期刊分级参与排序)、`search_web`、`fetch_url`
- **环境**:`read_file` / `write_file` / `edit_file` / `list_dir` / `grep` / `glob`(全部限定在工作区内)、`run_code`(沙箱执行;可读 Skills 根以跑包内脚本)
- **记忆**:`read_memory` / `write_memory` —— 项目级跨会话记忆:`memory/` 目录一条事实一个文件 + `MEMORY.md` 索引开局注入系统提示词;对用户完全透明
- **Skills**:`run_skill` —— 可运行工作流包(`.lumen/skills/<name>/SKILL.md` + 可选 `scripts/`);catalog 开局注入;激活正文回灌线程;脚本经 `run_code`+Seatbelt,**不是**第二套 memory(见下文 Skills 专节)
- **计划**:`update_plan` —— 复杂任务的结构化进度契约;结果回灌线程并写 `drafts/plan.md`;UI 以 PlanCard 投影(见 `doc/plan-card.md`)

约定:工具结果一律回灌线程;长交付物(报告、笔记)写成工作区文件,对话里只留指针。

### Skills(系统性能力包)

Skill ≠ Memory。Skill 是可**启动**的研究工作流;Memory 是长期事实。

```
~/.lumen/skills/<name>/           ← 用户全局
~/.lumen/workspaces/<id>/skills/  ← 与 memory/ 并列
<source_path>/.lumen/skills/      ← 可进 git 的源码树
```

优先级:源码树 > 工作区 > 用户。包布局:`SKILL.md` + 可选 `scripts/` / `references/` / `assets/`。

运行:`formatSkillCatalog` → systemPrompt「可运行的 Skills」段 → 模型 `run_skill` **或** UI 斜杠/`+` → `activate_skill`(与 `run_skill` 同构回灌 playbook) → 模型用现有工具落地;包内脚本走 `run_code` 同一 Seatbelt(技能根只读放行,写仍限工作区)。

**人机入口(走出 v1):** composer 输入 `/name` 弹出 Skills 列表(选中即激活);`+` → Skills 子菜单同路径;底栏 **Manage skills** 弹窗以**文件夹为主**安装(拷贝进 `~/.lumen/skills` 或项目 `skills/`),单文件仅收 `SKILL.md` 并包成目录;支持卸载。不做 ClawHub/zip 主入口、不做 plugin-skills 合流、不把完整 playbook 每轮打进 system prompt。

不做(仍禁):host `` !` ``、skill 特权提权、独立 Skill VM、自动扫 `.claude`。

过程稿:`briefs/archive/skills.md` · `briefs/archive/skills-slash-manage.md`。

## 运行时(runtime/)

`agent-runtime.ts` 管任务生命周期:

- `create_task` 建**草稿任务**:有会话、未起跑(支持先上传文件再开聊)
- `submit` 起跑:系统提示词 + 用户消息构成初始线程,进内核循环
- `continue` 续跑:从事件表重建线程(见存储层)后追加新消息继续
- durable 事件(model_step / tool_call / tool_result / reply / status_change / error …)持久化并广播
- ephemeral 事件(`text_delta` / `tool_call_start`)仅 live 广播(不占 seq、不入 SQLite/jsonl);断线重放只靠 durable,UI 用 `model_step` 定稿复原正文
- 资产视图:项目工作区文件列表,过滤 `cache/` 与 `sessions/`,只展示用户要的交付物

### 进程生命周期(本机)

- **生产路径(推荐)**:用户级 LaunchAgent `com.lumen.agent-service`(`KeepAlive` + `RunAtLoad`)托管 Node `service.ts`;登录即起,崩溃/睡眠后由 launchd 拉回。安装:`npm run launchd:install -w packages/agent-service` 或桌面 App 首次启动/设置「后台服务」。
- **开发兜底**:未装 Agent 时 Tauri 壳可临时 spawn sidecar;Cmd+Q 只杀壳自有 Child,不杀 LaunchAgent。
- `supervisor.ts` — Node 侧无头验证「子进程 → portfile → 可连 → 停」;与壳探测契约同构。

## 存储(storage/)

**事件溯源**是持久化的根:

- `db.ts` / `task-store.ts` — SQLite(`~/.lumen/lumen.sqlite`):`tasks`(含 `goal` 首句原文与可选 `title` 侧栏短名)与 `task_events`(按 seq 有序的全量事件);`title ≠ goal`,resume 兜底仍用 goal
- `resume.ts` · rebuildThread — 从事件重建可续跑线程,悬空 tool_call 自动修复;任何会话任意时刻可恢复
- `settings.ts` — 模型 profiles(provider / baseUrl / model / apiKey),界面内增改切换
- `budget.ts` — 基于事件的用量计量(token usage 随 model_step 入库)
- `session-file.ts` — 每会话 append-only JSONL trace,便于人工检查
- `evidence-index.ts` — 工作区产物之上的结构化索引(去重 / 范围查询)

## 协议(protocol/)

WebSocket + JSON:

| 类别 | 动作 |
|---|---|
| 项目 | `list_projects` · `create_project`(一等 Project;demo 模式禁用以免串访客) |
| 任务 | `create_task` · `submit` · `continue` · `cancel` · `resume` · `list` |
| 事件流 | `subscribe`(附事件重放;客户端按事件 id 去重);`task_updated`(侧栏 title 写回) |
| 资产 | `list_assets` · `read_asset`(shared + 当前会话;`scope` 标注) |
| Skills | `list_skills` · `install_skill` · `uninstall_skill` · `activate_skill`(显式激活=run_skill 同构回灌) |
| 设置 | `get_settings` · `update_settings` |

UI 状态是事件流的纯函数:对 durable 子集重放必然得到同一界面;live 会话额外叠加 ephemeral 增量,由随后的 `model_step` 定稿替换 streaming 泡。`client/agent-client.ts`(LumenClient)是类型化客户端,浏览器与 Node 测试共用。

## 模型接入(adapters/)

- `claude.ts` / `openai.ts`:有 `ChatHandlers` 时走 SSE 真流式(coalesce 后回调),否则整包(录制-重放零改语义)
- `retry.ts` 统一重试;`record-replay.ts` 录制/回放网络字节——验收测试的请求构造、响应解析与循环全走真实路径
- 内核经由 ModelPort 使用模型,对提供商无感知;切换模型 = 换 profile,不动代码

## 工作区(workspace/)

`fs-workspace.ts`:项目目录就是真实文件系统。布局:

```
~/.lumen/workspaces/<projectId>/
  shared/{papers,docs,notes}/   ← 项目级共享(同项目多会话可读;agent 会话 cwd 下只读挂载 shared/)
  memory/                       ← 跨会话记忆(索引 + 事实文件)
  skills/                       ← 项目级 Skills 包(与 memory 并列;语义是工作流不是事实)
  sessions/<taskId>/            ← 会话私有 scratch(聊天线程永不跨会话共享)
```

**共享的是资料,不是聊天。** 会话 cwd 仍是 `sessions/<taskId>/`;工具经 `shared/` 前缀只读访问共享区。`list_assets` 合并 shared + 当前会话并标注 `scope`。PDF 提取等中间产物进 `cache/`,不进资产列表。

**上传策略(admission ≠ representation,对齐 OpenSquilla):** UI 不按扩展名拒收;服务端 `saveUpload` 按表示归位——`pdf`→`papers/`、文本与源码→`docs/`、图→`images/`、其余→`uploads/`(opaque:落盘给工具读,不假定 inline 进模型)。体积上限见 `maxUploadBytes`(默认 25MB)。

## 服务与外壳

- `service.ts` — 进程入口:起 WS 服务,写 portfile(`~/.lumen/agent-service.json`:端口 / token)
- `supervisor.ts` — 把服务作为子进程拉起、等 portfile 就绪(Node 侧;Tauri 的 Rust 壳镜像同一套逻辑)
- **Tauri 壳(macOS)**:启动 sidecar → 等 portfile → 注入 WS 地址并开窗口
- **浏览器形态**:`npm run dev` 同时起服务(8787)与 Vite 开发页;客户端默认连 `ws://localhost:8787`

## ui-client

React + Vite。三栏工作台:会话列表 / 对话(全幅消息流,输入卡片悬浮其上)/ 工作区+阅读器(分栏可拖宽,工作区随产物自动展开)。`useAgent` 持有 WS 连接,把事件流 reduce 成界面状态;上传文件先在输入区暂存,发送时才进入工作区(宽准入,见上「上传策略」)。

**对话可视化(网页沙箱):** assistant 文本中的 ` ```show-widget ` 围栏由 ui-client 解析,在 `sandbox="allow-scripts"`(无 same-origin)的 receiver iframe 内渲染 HTML/SVG/JS;CSP 限制 CDN 白名单且 `connect-src 'none'`。过程与验收见 `briefs/active/web-sandbox-widget.md`。这与 `run_code` 的进程沙箱(Seatbelt)是不同隔离面。
