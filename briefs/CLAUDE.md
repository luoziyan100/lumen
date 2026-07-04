# briefs/ — 工作流层

> [PROTOCOL] brief 状态变更(新开/完成/否决)时:先更新 `README.md` 索引,完成的从 `active/` mv 进 `archive/`;
> 若 brief 产出了"定稿资产",按下方规则迁出后再归档。

职责:自包含的需求/调研工作说明,可直接交给人或另一个 AI 执行。`README.md` 是唯一索引与状态板。

## 生命周期

`active/`(进行中) → 实施完成 → `archive/`(归档,并在 README 标注结果)。不等额外提醒。

## 资产与过程稿分家(硬规则)

brief 是**过程稿**。当它的产出被确认为**产品资产**(提示词、数据表、规范条文),资产本体必须迁到正式位置,brief 里留一行指针后归档:

- 人格/提示词 → `packages/agent-service/src/agents/`(例:persona-prompt-v1 已落为 `agents/persona.ts`)
- 设计规范条文 → `doc/ui-design.md` §3
- 架构决策 → `doc/agent-core-architecture.md`(增补章节或里程碑行)

判据:如果删掉这个 brief 会丢失生产依赖的内容,说明资产还没迁出,不许归档。
