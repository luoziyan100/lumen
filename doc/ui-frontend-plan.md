# Lumen 前端落地设计(形态 A)

> 前端从"纯聊天框"改造成形态 A(对话主屏 + 工作区侧栏 + PDF 右侧分屏 + 上传)需要改/加什么。
> 给实现者(我 / Claude design)。后端 API 已全部就绪(见 §4),前端只是往上接。
> 状态:draft · 2026-06-11

---

## 1. 现状

`ui-client/src/` 5 个文件,纯聊天:

| 文件 | 现在做什么 |
|---|---|
| `main.tsx` | 挂载 App |
| `App.tsx` | 标题栏 + 聊天气泡列表 + 输入框 |
| `useAgent.ts` | 连 WS、submit/continue、把 event 投影成气泡(含 onClose 报错) |
| `agent-client.ts` | WS 客户端:submit/continueTask/cancel + 自动带 token |
| `styles.css` | **占位样式**(只定义了 4 个 CSS 变量,没接 Design System) |

能力到此为止:一问一答的对话。没有工作区、没有 PDF、没有上传、过程只是一行 "· 调用 X" 的灰字。

---

## 2. 目标布局(形态 A)

```
┌──────────────────────────────────────────────┐
│ Lumen · 研究                    任务   工作区 ≡│  TitleBar
├───────────────────────────────┬──────────────┤
│  对话(默认全宽)              │ 工作区侧栏    │  ← 点"工作区"滑出/收起
│  你: …                        │ 论文          │
│  Lumen: …                     │  置身钉内.pdf │  ← 只列 PDF + 生成 .md
│   ▸ 检索 OpenAlex·5篇  展开⌄  │  clark2013.pdf│    (txt 已被后端过滤)
│  [论文卡 / 文件卡]            │ 产物          │
│                               │  综述.md      │
│                               │  对比表.md    │
├───────────────────────────────┤  ＋ 上传 PDF │  ← 上传入口
│ 问点什么…       ＋PDF    [发送]│              │
└───────────────────────────────┴──────────────┘

点某个 PDF → 右侧变成分屏阅读器(pdf.js 渲染):
┌──────────────────────┬───────────────────────┐
│  对话(压窄)         │ clark2013.pdf   1/24 ✕│  ReaderPane
│                      │ [PDF 渲染页]          │
│  问…         [发送]  │                       │
└──────────────────────┴───────────────────────┘
点某个 .md → 同一 ReaderPane 区显示衬线正文。
```

三个区:**对话**(常驻)、**工作区侧栏**(可收)、**阅读器分屏**(打开 PDF/文件时占右半)。侧栏和阅读器互斥或叠放,由实现定(建议:侧栏是"列表",点条目在阅读器打开)。

---

## 3. 改造总览(一眼看范围)

- **改 4 个现有文件**:`App.tsx`(布局)、`useAgent.ts`(过程聚合 + 触发资产刷新)、`agent-client.ts`(加资产/上传方法)、`styles.css`(接 Design System + 分屏/侧栏/PDF 样式)。
- **新增**:`components/`(约 9 个组件)、`hooks/useWorkspace.ts`、pdf.js 渲染封装。
- **加依赖**:`pdfjs-dist`(**锁 4.10.38**,见 §8)。
- **接设计系统**:把 `old_lumen/Lumen_Design_System/colors_and_type.css` 的变量正式引入(替换 styles.css 的占位变量)。

---

## 4. 数据流(后端 API 已就绪,直接接)

| 能力 | 通道 | 接口(已实现) |
|---|---|---|
| 对话 | WS | `submit` / `continue` → `event` 流(已有) |
| 列工作区资产 | WS | `list_assets {projectId}` → `assets [{path,kind,name}]`(kind: pdf/doc) |
| 读 .md 正文 | WS | `read_asset {projectId,path}` → `asset {path,content}` |
| 渲染 PDF | HTTP | `GET /pdf?project=&path=&token=` → PDF 二进制(pdf.js fetch) |
| 上传 PDF | HTTP | `POST /upload?project=&name=&token=` body=PDF → `{path}` |

后端已做好的过滤:`list_assets` 只返回论文 PDF + 生成 `.md`,自动滤掉 `papers/*.txt` 抽取物和 `search-*.md` 检索缓存——前端不用再过滤。

---

## 5. `agent-client.ts` 要加的方法

```ts
// WS(走现有 send + pending 模式,像 submit)
listAssets(projectId): Promise<Asset[]>      // 发 {type:'list_assets'},收 {type:'assets'}
readAsset(projectId, path): Promise<string>  // 发 {type:'read_asset'},收 {type:'asset'}

// HTTP(从 ws url 推 http base + 带 token)
pdfUrl(projectId, path): string              // → http://host:port/pdf?project=&path=&token=  给 <embed>/pdf.js
async uploadPdf(projectId, file): Promise<string>  // POST /upload,返回工作区路径
```
`Asset` 类型:`{ path: string; kind: 'pdf' | 'doc'; name: string }`(与后端 `WorkspaceAsset` 对齐)。
注:WS 的内联 `ServerMessage` 要补 `assets` / `asset` 两个分支。

---

## 6. 状态 / hooks

- **`useAgent`(扩展现有)**:`messages` / `running` / `send` / `currentTaskId`(已有)。新增:把 event 流里的 `tool_call`/`tool_result`/`model_step` 聚合成"过程块"(见 §9),而不是散落成 status 气泡。
- **`useWorkspace`(新)**:
  - `assets: Asset[]` + `refresh()`:调 `listAssets`。**刷新时机**:每次收到 `reply`(模型可能写了文件)后、上传后、用户手动。
  - `open: { kind:'pdf'|'doc'|null; path?; content? }` + `openPdf(path)` / `openDoc(path)`(读 content)/ `close()`:驱动 ReaderPane。

---

## 7. 组件树

```
App
├ TitleBar                标题 + 任务入口 + 工作区开关
├ MainSplit               三栏布局容器(对话 | 侧栏 | 阅读器)
│ ├ ChatPane
│ │ ├ MessageList
│ │ │ ├ UserBubble
│ │ │ ├ LumenMessage      Lumen 长回答(衬线?小标题/列表排版)
│ │ │ ├ ProcessRow        可折叠过程行(§9)
│ │ │ └ PaperCard         论文卡(标题/作者/期刊/开放全文/读全文·存笔记)— 可选内联
│ │ └ Composer            多行输入 + ＋上传PDF 按钮 + 发送
│ ├ WorkspaceDrawer       可收侧栏:论文(PDF)分组 + 产物(.md)分组 + 上传入口
│ └ ReaderPane            右分屏:PdfViewer / DocViewer(互斥)
└ TaskList                后续(后台任务)
```

---

## 8. pdf.js 集成(关键约束)

- 用 `pdfjs-dist` 渲染 `/pdf` 返回的二进制。**锁 4.10.38,不要升 v5**——old_lumen 的血泪:v5 的 ESM 加载在 Tauri WebKit 下不工作。
- `PdfViewer`:`getDocument(pdfUrl)` → 逐页 `canvas` 渲染 + 分页;worker 用 4.10.38 的 worker。
- 选中文字 → "问 Lumen / 划线存笔记":**后续阶段**,先能渲染+翻页。

---

## 9. 过程行(把散事件聚合成可折叠块)

现在 `useAgent` 把每个 `tool_call` 推成一条 "· 调用 X" status 气泡,很碎。改成:
- 把"一轮 assistant 的 tool_call + 对应 tool_result"聚合成**一个过程块**,默认折叠成一行摘要(`检索 OpenAlex · 命中 5 篇`),点击展开看每步(工具名 + 结果计数)。
- 摘要文案按工具类型生成(search_papers→"检索…命中 N"、extract_pdf→"读 PDF…"、write_file→"写了 X")。

---

## 10. 样式

- 把 `styles.css` 的占位变量换成 **`Lumen_Design_System/colors_and_type.css`** 的正式变量(`--paper/--vellum/--sand/--ink/--ember/--moss/--indigo` + 字体栈)。正文阅读区(.md / PDF 旁注)用 Source Serif 4 衬线。
- 新布局:三栏 flex/grid;侧栏滑入(280ms);阅读器分屏(对话压到 ~50%)。动效守 Design System(无 bounce)。

---

## 11. 分阶段(建议落地顺序)

1. **P1 骨架**:三栏布局 + `agent-client` 资产方法 + `useWorkspace`(列资产)+ WorkspaceDrawer(能列出 PDF/产物,点条目占位)。对话照旧能用。
2. **P2 阅读器**:ReaderPane + DocViewer(读 .md)+ PdfViewer(pdf.js 渲染 /pdf)。点侧栏条目能打开看。
3. **P3 上传**:Composer 的 ＋上传 + 侧栏上传入口 → `/upload` → 刷新侧栏。
4. **P4 打磨**:过程行折叠、论文卡内联、空状态、Design System 正式接入。
5. **P5 后续**:PDF 选区→问 Lumen/存笔记、任务列表、跨刷新持久对话(localStorage 记 taskId)。

---

## 12. 注意点

- **token**:`agent-client` 已从 `window.__LUMEN_TOKEN__` / URL `?token=` 拿到;`pdfUrl` / `uploadPdf` 必须带上同一个 token(HTTP 端点也校验)。
- **资产刷新**:别轮询,挂在"收到 reply 后 + 上传后 + 手动"三个时机。
- **中文 PDF 名**:后端 `saveUpload` 把文件名安全化(中文→下划线防注入);前端上传时自己留一份原名做**显示名**,存盘用后端返回的安全 path。
- **project 维度**:当前固定 `'default'`;侧栏资产、PDF、上传都按这个 projectId。将来多 project 时统一参数化。
