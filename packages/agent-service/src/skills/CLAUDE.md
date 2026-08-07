# skills/ — 系统性能力包

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;完成后自检上级 CLAUDE.md。

职责:发现 / 解析 / 激活 Skill 包。与 `memory/` **产品正交**(工作流 vs 事实);路径消毒可借鉴。

## 成员

- `types.ts` — SkillMeta / SkillPackage / DiscoverRoots
- `parse.ts` — frontmatter 极简解析、变量替换、name 规范化
- `discovery.ts` — 三层发现(source > workspace > user)、catalog、activateSkill
- `install.ts` — installSkillFromPath / uninstallSkill(拷贝进根;单 SKILL.md 包装)
- `index.ts` — 公共出口

## 落盘

- `~/.lumen/skills/<name>/SKILL.md`
- `workspaces/<project>/skills/`
- `<source_path>/.lumen/skills/`

## 规则

- 激活走 `run_skill` 工具回灌,**或**协议 `activate_skill`(同构事件);不做静默改 system。
- 脚本执行不在本包;经 `run_code` + Seatbelt(只读技能根)。
- 安装单位=文件夹;单文件仅 SKILL.md → 包成目录后拷贝。
