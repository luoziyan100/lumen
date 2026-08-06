/**
 * [INPUT]: 无
 * [OUTPUT]: SkillMeta / SkillPackage / DiscoverRoots —— Skills 领域类型
 * [POS]: skills/ 的契约面;与 memory 产品正交(工作流 vs 事实)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type SkillLayer = 'source' | 'workspace' | 'user'

export interface SkillMeta {
  name: string
  description: string
  whenToUse?: string
  argumentHint?: string
  /** true = 不进模型可见 catalog(仍可被显式 run_skill 若已知名) */
  disableModelInvocation: boolean
}

export interface SkillPackage extends SkillMeta {
  /** 含 SKILL.md 的技能目录绝对路径 */
  baseDir: string
  skillFile: string
  layer: SkillLayer
}

export interface DiscoverRoots {
  /** ~/.lumen/skills */
  userSkillsDir: string
  /** workspaces/<project>/skills */
  workspaceSkillsDir: string
  /** <source_path>/.lumen/skills,可选 */
  sourceSkillsDir?: string | null
}
