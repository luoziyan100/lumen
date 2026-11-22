<div align="center">

<img src="doc/hero.png" alt="Lumen" width="820">

# Lumen

本机论文研究工作台：围绕一个好奇的问题开主题，和 AI 一起把想清楚的东西画在白板上。

</div>

Mastra 管 Agent、工具循环、问答、审批、后台专家与持久对话；Lumen 管主题、资料库、白板、研究工具、材料边界与桌面交互。产物是可审阅的文件，不是聊天记录。

## 工作台形态

- 左栏 · 主题：一个好奇的问题一个主题，状态灯区分「AI 在运行」和「在等你」；一个主题同一时刻只跑一段对话，主题忙着就直接打开那段运行或等你的对话。栏可收起（⌘B / ⌘⌥B），底部只有设置——专家在设置里。主题是唯一入口，换对话不换白板。
- 中栏 · 视图导航：解读 · 白板 · 沉淀 · 概念图 · 灵感 · 全部。解读是默认视图；前三个已开放，后三个是如实的占位；图标加文字，放不下只留图标。
- 解读：在素材行上点「写解读」，AI 把一篇论文分节讲给你听，正文可以穿插公式、Mermaid 图和可调参数的交互小实验，每段带原文出处或「AI 推断」标记。选中一句话就能就地问 AI，问过的地方留下足迹；AI 之后改了那句，足迹也不会丢。
- 白板：人和 AI 共画的 Excalidraw 画布，一个主题可以有多张。AI 只经专用工具作画，模型支持看图时还能看到画面；它擦掉你的笔画时会提示，可以一键恢复。每次运行结束给有变化的白板留一个快照。
- 沉淀：只记你自己的话。可以从白板、解读的提问窗或沉淀视图写一条；AI 停笔时会邀请你记一条，它提议的版本只能删字，不能替你加词。
- 右栏 · 素材：本主题引用的原件，按加入时间倒序；即时搜索（标题与链接，中文按子串）、多选上传，每行标题下给链接短写。点一条在中栏分屏打开原件，也可以从这里写解读或打开已有解读。
- 阅读器三态：关闭 / 分屏（可拖分隔条）/ 铺满中栏（白板隐藏但保持挂载与相机，Esc 还原）。
- 精灵：对话住在应用内的全身精灵里，可拖到窗口任意位置、停靠成面板或收起。桌面独立形态的代码保留，但已集中关闭。
- 主题与对话都可以重命名、归档、删除和复制 ID；归档的东西只在设置的「已归档」里出现。
- 设置六分类：模型、研究偏好、专家、外观、说话习惯、已归档。外观本机即时生效（含界面语言：英文默认，可切中文），密钥只单向提交。

## 研究能力

- 资料库：原件只存一份，主题按引用使用，只断开引用不删原件。
- 模型：支持 OpenAI 兼容接口、Anthropic 协议和 Google Gemini 原生接口。
- 研究工具：论文/引用/网页检索，PDF/DOCX 读取可收进资料库作出处，支持视觉的模型直接理解图片。
- 多 Agent：内建专家角色，也支持分层 Markdown 自定义；专家产物写入独立目录由主研究者整合，专家只能看白板、不能画。
- 代码执行：Node/Python 在 Seatbelt 沙箱里默认自动执行，显式权限设置照常生效；有超时与停止，网络走域名白名单代理。
- 本地诊断：原生 trace、问题标注、脱敏导出，以及隔离的录制回放与无工具评估。文本匹配不代表研究质量。

## 开发

需要 Node.js 24 或以上。

```sh
npm install
npm run dev
```

打开 `http://localhost:5180`，在设置里填模型接口、模型名和 API Key。开发数据默认在 `~/.lumen-studio-dev`，可用 `LUMEN_MASTRA_HOME` 指定独立根。

```sh
npm run typecheck                     # 两个包的类型检查
npm test                              # 服务与客户端的全部用例
npm run verify                        # npm test + 青瓷主题合同 + 界面文案不许硬编码中文
```

## macOS 桌面

桌面应用 `Lumen.app`（bundle id `com.lumen.studio`；2026-11-12 前叫 Lumen Studio.app）默认连接 `~/.lumen-studio` 中发现的 `com.lumen.studio` 服务，不连旧形态的 `~/.lumen-mastra` / `com.lumen.mastra`。

```sh
npm run launchd:install -w @lumen/mastra-service -- \
  --node /绝对路径/node \
  --project-root /绝对路径/lumen \
  --data-root /绝对路径/.lumen-studio

npm run tauri:build -w packages/ui-client
```

安装产物位置以构建日志为准（`…/bundle/macos/Lumen.app`）。当前桌面仍需要本机 Node 与项目目录，不是自带运行时、公证签名的独立安装包。

新数据根可用 `start.ts --data-root <新根> --settings <旧根>/settings.json` 一次性导入模型档案（只允许导入到未初始化的根，旧根只读）。预览部署使用独立 label（`com.lumen.studio.preview`）与数据根，不与正式服务共享数据库。详见 `packages/mastra-service/scripts/CLAUDE.md`。

## 架构

```text
packages/mastra-service/   Mastra 1.85 + Hono，消息/运行/恢复由框架持有
packages/ui-client/        React 19 + 官方 HTTP/SSE SDK + Excalidraw + Tauri 2 薄壳
doc/                       架构与设计决策（入库部分）
```

- 运行架构与模块边界：[doc/mastra/architecture.md](doc/mastra/architecture.md)、[doc/mastra/modules.md](doc/mastra/modules.md)
- 产物与白板版本循环：[doc/artifact-loop.md](doc/artifact-loop.md)
- 文档摄取与渲染：[doc/document-ingest.md](doc/document-ingest.md)、[doc/mermaid-pipeline.md](doc/mermaid-pipeline.md)
- 当前职责、边界与取舍也写在每个目录的 `CLAUDE.md` 里（分形文档）。

旧自研循环、WS 协议与重复消息存储已退出运行路径。

## License

[MIT](LICENSE)
