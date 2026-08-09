# Lumen — Grok 项目规则

> 工程地图与铁律见根目录 `CLAUDE.md`（分形文档、模块、坑、验收清单）。**本文件不复述**，只补「在这个仓库里怎么干活」的项目级约定。冲突时以本文件与更深层目录规则为准。

## 产品

- **Lumen = 本机个人工作台 / Co-Worker**（办公与研究为主），不是「只做论文的 agent」。
- 聊天是操作面；**交付物是工作区文件**（notes / drafts / papers / docs…）。
- 壳：`packages/ui-client`（React + Tauri）；脑：`packages/agent-service`（无头 Node + WS）。

## 分支与实验

- 默认开发线常在 `experiment/glass-ui`（暗玻璃 / Curtain 等 UI 实验）；**暖纸真源在 `main`**。
- 未确认前：不要把 glass 实验合进 main；推远程前先问。
- 重装桌面壳：`npm run tauri:build -w packages/ui-client` → 覆盖 `/Applications/Lumen.app` → `open`；改 service 才需要 `launchd` 重装。

## 工作方式（本仓库）

- 中文交流；结论先于细节。
- **禁止 mock / 假数据 / 硬编码结果冒充完成**；测例绿 ≠ 生产路径通，关键路径在真实工作区再验。
- ≥3 步先短计划；不可逆操作（删数据、force-push、对外发版、花钱）前停下确认。
- 任务单元收尾：**先验证（test / tsc / 真跑）再细粒度 git commit**；未要求不 push。
- 设计决策先 `doc/`，过程稿走 `briefs/`；聊完未落盘 = 不存在。
- 人格 L0–L3（`packages/agent-service/src/agents/persona.ts`）不随手改；走 brief + 回测（见 `briefs/active/persona-*`）。
- API key / token 只进 `.env` 或设置 UI，不进命令行参数、文档、提交。

## 动手前必读

- 架构铁律：`doc/agent-core-architecture.md`
- UI token / 青瓷：`doc/ui-design.md` §3 + `packages/ui-client/src/tokens.css`
- WS 协议两处手工同步：`agent-service/.../messages.ts` ↔ `ui-client/src/agent-client.ts`
- 当前 active brief：`briefs/README.md` + `briefs/active/`

## 常用命令

```bash
# 服务测试
cd packages/agent-service && npm test

# UI
cd packages/ui-client && npm run dev    # 或 npm test / npm run build
npm run check:theme -w packages/ui-client   # 升级 kumo 后

# 双端开发（仓库根）
npm run dev
```
