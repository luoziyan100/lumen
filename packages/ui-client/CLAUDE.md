# ui-client — Tauri 薄客户端

> [PROTOCOL] 本包目录增删或职责变更时:先更新本文档与对应子目录 CLAUDE.md,再动代码;视觉规范变更须先落 `doc/ui-design.md` §3 并同步 `src/tokens.css` 头注释。

职责:形态 A 的 UI(对话主屏 + 会话侧栏 + 工作区抽屉 + 阅读器分屏 + 设置),连 agent-service 的 WS。Web 可跑;Tauri 外壳见 `src-tauri/`。

## src/ 根成员(≤15 散文件)

| 成员 | 职责 |
|---|---|
| `App.tsx` | 布局容器;装配侧栏/对话列/composer/右轨;连接与会话编排 |
| `main.tsx` | 入口 |
| `useAgent.ts` | hook 相:订阅事件、viewEpoch、send/stop;归约再导出自 `chat/` |
| `agent-client.ts` | 浏览器侧 WS 客户端;`import type` 直连 `agent-service/src/protocol/messages.ts`;hello 校验 `protocolVersion` |
| `ensureAgent.ts` | Tauri invoke:`ensure_agent_service` + `launchd_status/install/uninstall` |
| `useWorkspace.ts` | 资产列表:无会话仅 shared;有会话 shared+session;切新对话乐观清 session |
| `sourceCite.ts` | 检索/抓取 URL + 检测正文 Sources;宿主表仅漏写兜底 |
| `openExternal.ts` | 外链走壳 `open_external_url` |
| `trustedHosts.ts` | 外链确认「这个域名不再问」 |
| `activePath.ts` | 当前稿路径消毒(产物闭环 P0) |

## src/ 子目录

| 目录 | 职责 |
|---|---|
| `app/` | App 拆出的连接/空态/对话列/composer 草稿 hooks |
| `chat/` | 事件→ChatItem 纯函数(types / reduce / todo) |
| `copy/` | 文案与问候(简体中文,不用 emoji) |
| `mermaid/` | 流程图语法闸 / 颜色 / 布局 / 缩放 |
| `scroll/` | 对话列贴底 + 滚动诊断 |
| `composer/` | 附件准入 / 斜杠 / Skill 选路 / 用户长文折叠阈值 |
| `sessions/` | 侧栏序 / 可见窗 / 未读灯 / 展示名 |
| `marquee/` | 侧栏跑马灯热态与时长 |
| `process/` | 过程步窗口 / 计时 / orb 九态 |
| `shell/` | Tauri 选文件夹 / 栏宽拖拽 |
| `appearance/` | 整窗皮肤 |
| `components/` `components/widget/` `aura/` | 见各自 CLAUDE.md |

样式:`tokens.css`(设计系统真源) / `styles.css` / `kumo.css` / `theme-celadon.css`。主题校验:`npm run check:theme`。类型闸门:`npm test` / `npm run typecheck` 先 `tsc --noEmit`(协议真源在 agent-service `messages.ts`)。

## 设计纪律(违者打回)

- 颜色/阴影/圆角/字体只用 token;正文对比度 ≥ 4.5:1,元数据 ≥ 3:1。
- 三层纵深:氛围(边缘)→ 纸面(正文所坐)→ 卡片(输入卡/弹窗)。**文字永远不直接压在动效上**;空态是唯一的全屏氛围(封面)。
- 青绿只做品牌与确认;链接黛蓝、错误赭红、警示琥珀。
- **控件一律来自 @cloudflare/kumo**(无头核 Base UI),禁止再手搓按钮/弹层/下拉。
- `pdfjs-dist` 锁 4.10.38(v5 在 Tauri WebKit 下 ESM 不工作)。
