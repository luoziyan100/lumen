/**
 * [INPUT]: discovery / parse / types
 * [OUTPUT]: skills 模块公共出口
 * [POS]: skills/ 的门面
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export {
  activateSkill,
  buildDiscoverRoots,
  defaultUserSkillsDir,
  discoverSkills,
  formatSkillCatalog,
  skillReadRoots,
  sourceSkillsDir,
  workspaceSkillsDir,
} from './discovery.ts'
export { applySkillSubstitutions, normalizeSkillName, parseFrontmatter, parseSkillMarkdown } from './parse.ts'
export type { DiscoverRoots, SkillLayer, SkillMeta, SkillPackage } from './types.ts'
