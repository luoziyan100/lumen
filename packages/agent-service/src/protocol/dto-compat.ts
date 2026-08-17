/**
 * [INPUT]: dto 线上形 + storage/runtime 同名实现形
 * [OUTPUT]: 编译期断言 StoreX extends WireX(多字段可赋给少字段);无运行时导出
 * [POS]: protocol/ 闸门半边;只在 tsc --noEmit 下生效,strip-types 看不见
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type {
  Project as WireProject,
  PublicModelProfile as WirePublicModelProfile,
  PublicSettings as WirePublicSettings,
  SettingsPatch as WireSettingsPatch,
  SkillInfo as WireSkillInfo,
  Task as WireTask,
  TaskEvent as WireTaskEvent,
  WorkspaceAsset as WireWorkspaceAsset,
} from './dto.ts'
import type { Project as StoreProject } from '../storage/project-store.ts'
import type {
  PublicModelProfile as StorePublicModelProfile,
  PublicSettings as StorePublicSettings,
  SettingsPatch as StoreSettingsPatch,
} from '../storage/settings.ts'
import type { Task as StoreTask, TaskEvent as StoreTaskEvent } from '../storage/task-store.ts'
import type { SkillInfo as StoreSkillInfo } from '../runtime/agent-runtime.ts'
import type { WorkspaceAsset as StoreWorkspaceAsset } from '../runtime/assets.ts'

type Assert<T extends true> = T

type _TaskOk = Assert<StoreTask extends WireTask ? true : false>
type _TaskEventOk = Assert<StoreTaskEvent extends WireTaskEvent ? true : false>
type _ProjectOk = Assert<StoreProject extends WireProject ? true : false>
type _WorkspaceAssetOk = Assert<StoreWorkspaceAsset extends WireWorkspaceAsset ? true : false>
type _SkillInfoOk = Assert<StoreSkillInfo extends WireSkillInfo ? true : false>
type _PublicModelProfileOk = Assert<StorePublicModelProfile extends WirePublicModelProfile ? true : false>
type _PublicSettingsOk = Assert<StorePublicSettings extends WirePublicSettings ? true : false>
type _SettingsPatchOk = Assert<StoreSettingsPatch extends WireSettingsPatch ? true : false>
