# Lumen — 工程地图(分形文档之根)

Lumen 是独立研究者的论文研究 agent:**无头 Node agent 服务 + Tauri 薄客户端**。
它的产出是文件(notes/ drafts/ papers/),不是聊天气泡。

> [PROTOCOL] 本仓库文档是四层分形:**根(地图) → 包(模块) → 目录(成员职责) → 文件头([INPUT]/[OUTPUT]/[POS])**。
> 任何变更:先改所属层级的文档,再动代码;完成后逐级向上自检 CLAUDE.md 是否仍准确。
> 设计决策(架构/视觉)变更走 doc/,过程性工作说明走 briefs/,聊天里达成的约定不落文档 = 不存在。

## 铁律(验收一切的尺子,违者打回)

1. **agent = 一条只增不减线程上的循环**;每个 tool_call 的结果必回灌同一条线程,模型必须看见自己行为的后果。
   → `doc/agent-core-architecture.md` §1
2. **测试禁止绕过真实内核路径**:录制-重放 + 不变式测试 + 特性交叉矩阵;CI 全绿但全靠替身 = 验收不通过。
   → 同文档 §9,`packages/agent-service/tests/CLAUDE.md`
3. **UI 只用 tokens.css 的 token**,禁硬编码颜色/阴影;正文对比度 ≥ 4.5:1,元数据 ≥ 3:1;青绿只做品牌,语义色各归其位。
   → `doc/ui-design.md` §3(青瓷 v2),`packages/ui-client/src/tokens.css` 头部注释

## 模块

| 路径 | 职责 | 文档 |
|---|---|---|
| `packages/agent-service/` | 无头 agent 大脑:内核 + 工具 + 存储 + WS 服务(Node) | `packages/agent-service/CLAUDE.md` |
| `packages/ui-client/` | Tauri 薄客户端:React UI,连 WS | `packages/ui-client/CLAUDE.md` |
| `doc/` | 宪法层:架构与设计规范(深文档,带状态) | `doc/CLAUDE.md` |
| `briefs/` | 工作流层:自包含工作说明(active/archive) | `briefs/CLAUDE.md` |

## 常用命令

- 测试:`cd packages/agent-service && npm test`(node --experimental-strip-types + node:test,零框架)
- UI 开发:`cd packages/ui-client && npm run dev`;构建:`npm run build`
- 连服务:所有 WS 必带 `?token=`,端口与 token 在 `~/.lumen/agent-service.json`(0600)

## 已知的坑(动手前先读)

- `pdfjs-dist` 锁 **4.10.38**:v5 的 ESM 加载在 Tauri WebKit 下不工作。
- WS 协议类型在 `agent-service/src/protocol/messages.ts` 与 `ui-client/src/agent-client.ts` **各一份、手工同步**
  (`@lumen/shared` 未建,详见 `packages/agent-service/src/protocol/CLAUDE.md`)。改消息格式必须两处一起改。
- `better-sqlite3` 是 native 依赖:Tauri sidecar 打包时需匹配 Node ABI(M7 前留意)。
- macOS 上不要用 nohup 起常驻进程;service 生命周期走 supervisor / Tauri sidecar。
- ui-client 的 Tailwind `@source` 指向**仓库根** node_modules(workspace 依赖提升);升级 `@cloudflare/kumo` 后必跑
  `npm run check:theme -w packages/ui-client`(青瓷主题对 Kumo 变量合同的覆盖校验)。

## 文档验收(每次收尾自检)

- [ ] 新增/删除目录 ⇒ 对应 CLAUDE.md 增删,上一级模块表同步。
- [ ] 新增源文件 ⇒ 带 `[INPUT]/[OUTPUT]/[POS]` 文件头,并进所在目录 CLAUDE.md 的成员表。
- [ ] 架构/设计决策变更 ⇒ 先落 `doc/`(并刷新 `doc/CLAUDE.md` 状态表),再动实现。
- [ ] 完成一份 brief ⇒ `mv briefs/active/x.md briefs/archive/` 并更新 `briefs/README.md`。
