# ui-client — Tauri 薄客户端

> [PROTOCOL] 本包目录增删或职责变更时:先更新本文档与对应子目录 CLAUDE.md,再动代码;视觉规范变更须先落 `doc/ui-design.md` §3 并同步 `src/tokens.css` 头注释。

职责:形态 A 的 UI(对话主屏 + 会话侧栏 + 工作区抽屉 + 阅读器分屏 + 设置),连 agent-service 的 WS。Web 可跑;Tauri 外壳见 `src-tauri/`。

## src/ 成员

| 成员 | 职责 |
|---|---|
| `App.tsx` | 布局与装配:标题栏 / 侧栏 / 对话 / 抽屉 / 阅读器 / 弹窗;空态 = 封面(氛围全屏,问候+输入卡居中偏上) |
| `agent-client.ts` | 浏览器侧 WS 客户端(⚠ 协议类型手工内联,改协议三处对齐,见 agent-service/src/protocol/CLAUDE.md) |
| `useAgent.ts` | 事件流 → ChatItem 归约(消息 / 可折叠过程块);记录最近 taskId 但不自动恢复(开屏即欢迎页,仅运行中任务由 App 接回) |
| `useWorkspace.ts` | 工作区资产列表 + 打开的资产(驱动阅读器) |
| `tokens.css` | **设计系统唯一真源**(青瓷 v2):表面三级 / 语义五色 / 阴影 0–3 / 字体分工;头注释即规范 |
| `styles.css` | 形态 A 布局与组件样式;只消费 token,禁硬编码颜色 |
| `kumo.css` | 控件层样式入口:Tailwind v4(**刻意不含 preflight**)+ @cloudflare/kumo + 青瓷主题 |
| `theme-celadon.css` | Kumo 青瓷主题(tokens.css 在 Kumo 变量合同上的派生物,light-dark 双值) |
| `scripts/check-theme-celadon.mjs` | 主题覆盖校验(`npm run check:theme`);升级 kumo 后必跑 |
| `appCopy.ts` / `settingsCopy.ts` / `greeting.ts` | 文案与问候(简体中文,不用 emoji) |
| `components/` `aura/` | 见各自 CLAUDE.md |

## 设计纪律(违者打回)

- 颜色/阴影/圆角/字体只用 token;正文对比度 ≥ 4.5:1,元数据 ≥ 3:1。
- 三层纵深:氛围(边缘)→ 纸面(正文所坐)→ 卡片(输入卡/弹窗)。**文字永远不直接压在动效上**;空态是唯一的全屏氛围(封面)。
- 青绿只做品牌与确认;链接黛蓝、错误赭红、警示琥珀。
- **控件一律来自 @cloudflare/kumo**(无头核 Base UI),禁止再手搓按钮/弹层/下拉。已落地:
  Button(设置/标题栏/新对话/发送/停止/添加文件)/ Dialog(设置)/ Select / Tooltip(全部图标钮)/
  Toasty+toast(上传失败)/ CommandPalette(⌘K 会话搜索)/ Collapsible(过程行+抽屉卡片)。
  **自绘白名单仅四类**(列表项/气泡/过程行/图标导航钮),见 doc/ui-design.md §3 控件形制。
  皮肤经 `theme-celadon.css`(挂 `<html data-theme="celadon">`);改 tokens.css 语义色时同步它,升级 kumo 后跑 `npm run check:theme`。
- `pdfjs-dist` 锁 4.10.38(v5 在 Tauri WebKit 下 ESM 不工作)。
- 待办(勿顺手乱做,单独立 brief):composer 多行 + 运行中禁用(可用 Kumo InputArea);字体本地打包(去 CDN);
  aura 闲置降耗;Collapsible 高度动画(webfont 竞态会量高过期,待字体本地化后按 --collapsible-panel-height 方案补);
  aura 在 WKWebView(Tauri)的 blocked 态渲染成铅笔线条感,与 Chrome 不一致,待校准 shader 参数或按引擎降级。
