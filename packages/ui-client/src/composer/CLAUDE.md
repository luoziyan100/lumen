# composer/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

输入卡旁路:准入、斜杠、Skill 选路、用户长文阈值。

## 成员

- `composerAccept.ts` — `filterComposerFiles`;扩展名不挡门
- `skillSlash.ts` — `/token` 解析
- `pickSkillPath.ts` — Tauri 选 Skill 文件夹 / SKILL.md
- `msgFold.ts` — 用户气泡折叠阈值(9 行 / 750 字)
