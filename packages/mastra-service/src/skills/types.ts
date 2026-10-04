/**
 * [INPUT]: 应用显式提供的任务目录与三个技能根
 * [OUTPUT]: SkillMeta/SkillPackage/SkillRoots/SkillRegistryOptions/InstallScope
 * [POS]: 技能领域契约；无运行时、协议或用户主目录依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type SkillLayer = 'source' | 'project' | 'user'
export type InstallScope = 'user' | 'project'

export interface SkillMeta {
  name: string
  description: string
  whenToUse?: string
  argumentHint?: string
  disableModelInvocation: boolean
}

export interface SkillPackage extends SkillMeta {
  baseDir: string
  layer: SkillLayer
}

export interface SkillRoots {
  userSkillsDir: string
  projectSkillsDir: string
  sourceSkillsDir?: string
}

export interface SkillRegistryOptions {
  workspaceDir: string
  roots: SkillRoots
}
