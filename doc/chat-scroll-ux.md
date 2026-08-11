# 对话列滚动体验（产品规格）

状态: **现行** · 2026-08-11  
实现: `packages/ui-client/src/useStickToBottom.ts`  
对照: OpenWork `scroll-controller` / opensquilla `autoScroll`（思想，非依赖）

> 人怎么「看」一场研究对话 → 滚动只服务意图。技术手段可换，下列验收不可破。

---

## 1. 三种阅读意图

| 意图 | 人在干什么 | 产品保证 |
|------|------------|----------|
| **A 追更** | 看最新输出 | 未读历史时，视口贴最新；输入卡上方能看到刚说完的话 |
| **B 回看本轮** | 在同一条长回答里上下看 | 连续像素滚动；不瞬移、不被拽回底 |
| **C 换轮** | 有意识看上一问 | 仅轮次轨 /「回到最新」等**主动**控件可大跳 |

普通滚轮/触控板 **只服务 A/B**，禁止被解释成 C。

---

## 2. 架构事实（避免误诊）

| 项 | Lumen |
|----|--------|
| 渲染 | 整会话 `items` 一次进 DOM（非虚拟列表） |
| 触顶 | **不**分页加载更早消息 |
| 跳闪主因 | 贴底逻辑与手势抢权 + 超长 mermaid/表格高度变化，**不是** ChatGPT 式 prepend 历史 |

---

## 3. 验收（人感）

1. 从本轮最后一行轻滑向上：先本轮更早段落/本轮图，再上一轮用户话——顺序正确。  
2. 停在本轮大图中间 2s：不漂移；composer 打字不拽视口。  
3. 生成中上滑读前文：底下继续长字，**不**自动拉回底部。  
4. 仅「回到最新」允许一次大跳回底。  
5. 无「中间连续闪过多屏陌生内容、最后又落回」的过山车。

---

## 4. 行为合同（实现必须）

| 规则 | 说明 |
|------|------|
| sticky / manual 双态 | 仅 sticky 时自动贴底 |
| 手势窗 ≥600ms | wheel/touch/pointer 后禁止自动 `scrollTo(bottom)` |
| 上滑 ≥16px | `scrollTop` 增量判定离开 sticky |
| **进 sticky 须用户意图** | 仅「本帧 `scrollTop` 增加且 gap≤阈值」才 re-sticky；**禁止**仅因布局塌缩 gap 变小就吸回（V1 mermaid） |
| 塌缩护栏 | 内容高度一次掉 >80px 后 ~800ms 内禁止 re-sticky |
| 程序化可打断 | 贴底进行中用户上滑 → 立刻改 manual |
| 只跟内容增高 | RO 看 **内容区** 高度，不因 composer 改 clientHeight 误跟 |
| 回缩不追 | 高度变矮只改基线，不硬滚 |
| RO 重绑不拽底 | 观察者重绑不得 `applySticky(true)+force follow` 打断 manual |
| overflow-anchor | sticky 时 `none`；manual 时 `auto` |
| 修正无动画 | 自动贴底用 `auto`，不用 smooth（「回到最新」除外） |

---

## 5. 非目标

- 虚拟列表 / 触顶分页（会话极长时另开决策）  
- 把大跳伪装成 smooth「帮用户滚过去」  
- 滚动条拖动时仍强制 sticky  

---

## 6. 滚动调试（桌面无控制台）

默认关闭，**不改变滚动行为**。

- 应用内：`⌃⌥⇧S` 开/关右下角「滚动诊断」→ 复现 → **复制日志** 贴聊天
- 开发者备选：`localStorage lumen:scrollDebug=1`

| 日志 tag | 含义 | 支持假设 |
|----------|------|----------|
| `scrollToBottom-H1` / `follow` | 程序贴底 | H1 |
| `content-resize-H2?` | 高度变化 | H2 |
| `height-collapse` | 一次大塌缩 | H2 + 进 sticky 护栏 |
| `stabilize-H5` / `stabilize-skip-gesture` | manual 锚定 | H5 |
| `sticky→` 反复 1↔0 | sticky 抖动 | H1/H4 |

### V1 结案（2026-08-11 用户日志）

- **现象**：大 mermaid 会话上滑阅读时视口抽动
- **证据**：`contentH` 在 31365↔34893（Δ≈3528）振荡；`sticky→` 与 `follow force` 同 ms；手势窗内 `→settle-follow` / `→stabilize` 交替
- **机制**：高度塌缩把 gap 挤到贴底阈值 → 旧逻辑 `gap≤4` 即 `sticky=true` → follow 拽底 → 高度回弹 → 再离 sticky（H1+H2 闭环）
- **修复**：`shouldEnterSticky` 只认向下滚；塌缩护栏；RO 重绑不 force；mermaid 缓存同步首帧防塌

## 7. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-08-11 | 初版：三意图 + 五条验收 + 实现合同 |
| 2026-08-11 | 增加 scrollDebug 只读观测开关 |
| 2026-08-11 | V1 结案：进 sticky 用户意图 + 塌缩护栏 + 应用内 HUD |
