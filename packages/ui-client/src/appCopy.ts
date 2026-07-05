export const APP_BRAND_COPY = {
  name: 'Lumen',
  subtitle: '',
} as const

export const APP_TITLEBAR_ACTIONS = [
  { id: 'workspace', label: '工作区' },
] as const

/** 侧栏左下角账户区(账号功能未做前 = 设置入口;将来扩成账户菜单) */
export const SIDEBAR_ACCOUNT_COPY = {
  name: '本地账户',
  hint: '设置',
} as const

export const APP_TITLEBAR_WORKSPACE_TOGGLE = {
  id: 'workspace-toggle',
  icon: 'panel',
  position: 'before-workspace',
  controls: 'workspace-drawer',
  buttonSize: 36,
  iconSize: 22,
  gapToLabel: 4,
} as const

export const APP_NAV_ICON_BUTTON = {
  buttonSize: 36,
  iconSize: 22,
} as const

export const WORKSPACE_DRAWER_COPY = {
  title: '工作区',
  countUnit: '项',
  internalCollapseGlyph: '',
} as const
