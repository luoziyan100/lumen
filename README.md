<div align="center">

<img src="doc/hero.png" alt="Lumen" width="820">

# Lumen

**个人 AI 工作台** — 本机上的办公搭档(Co-Worker):聊天只是操作面,活儿落在真实工作区文件里。

_A local-first personal workbench: your on-device co-worker for everyday office work, with files as the durable output._

</div>

## 它做什么

- **个人工作台**:非编程向的日常办公(整理、研读、起草、汇总);按项目组织多会话,资料可共享、聊天互不串
- **文件即交付**:报告、笔记、纪要写进工作区,不是埋在聊天气泡里
- **三栏布局**:项目/会话 · 对话 · 工作区+阅读器,读与写互不打架
- **模型可插拔**:DeepSeek、Claude 或任意 OpenAI 兼容端点,界面里即可切换
- **本地优先**:数据(SQLite)和所有文件都在你自己的电脑上

## 快速开始

当前以 **Web 开发模式** 运行:需要本机先装好 Node,再 clone 启动。自包含 DMG(下载即用)仍在路上。

### 1. 准备 Node 环境

需要 **Node.js ≥ 22.6**(自带 npm)。终端执行 `node -v` 确认版本。

macOS 推荐用官方安装包或包管理器任选其一:

```bash
# 方式 A: Homebrew
brew install node@22

# 方式 B: nvm(便于多版本共存)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 重开终端后:
nvm install 22
nvm use 22
```

Windows / Linux 可从 [nodejs.org](https://nodejs.org/) 安装 LTS(选 22.x 及以上)。

### 2. 安装并启动

```bash
git clone https://github.com/luoziyan100/lumen.git
cd lumen
npm install
npm run dev        # 同时启动 agent-service + Web 界面
```

### 3. 打开并配置模型

浏览器打开 **http://localhost:5180**,点左下角「设置」,填入你的模型 API Key(支持 DeepSeek / Anthropic / OpenAI 兼容中转),即可开始工作。

> 也可以把 `packages/agent-service/.env.example` 复制为 `.env`,用环境变量预填 Key / 端口等。

## macOS 桌面版

Tauri 原生壳已可本地构建:`npm run tauri:build --workspace @lumen/ui-client`(仍需本机 Node 与仓库路径,不是给陌生人用的安装包)。
**可直接下载的自包含 .app / .dmg(内置运行时 + 签名公证)在路上**,见路线图。

## 架构

```
packages/
  agent-service/   # 无头 agent 服务:内核循环 + 工具 + SQLite 存储 + WebSocket(Node)
  ui-client/       # 薄客户端:React + Vite;Tauri 原生壳(macOS)
```

内核只有一条铁律:**agent 是一条只增不减的消息线程上的循环,每个工具调用的结果必须回灌同一条线程**——模型永远看得见自己行为的后果。详见[架构文档](doc/agent-core-architecture.md)。

## 路线图

- [x] agent 内核 / 工具 / 存储 / WS 协议
- [x] 工作区文件产物、PDF 阅读与报告
- [x] 会话恢复、上传暂存、工作区阅读器
- [x] 一等项目(侧栏树 + 项目级共享区)
- [ ] 上下文水位与超窗软着陆
- [ ] 自包含 macOS .app(内置运行时 + 公证),下载即用
- [ ] 办公场景工具与工作流加深

## License

[MIT](LICENSE)
