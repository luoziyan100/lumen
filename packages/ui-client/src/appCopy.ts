export const APP_BRAND_COPY = {
  name: 'Lumen',
  subtitle: '',
} as const

export const APP_TITLEBAR_ACTIONS = [
  { id: 'workspace', label: '工作区' },
  { id: 'settings', label: '设置' },
] as const

export const APP_TITLEBAR_WORKSPACE_TOGGLE = {
  id: 'workspace-toggle',
  icon: 'panel',
  position: 'before-workspace',
  controls: 'workspace-drawer',
  buttonSize: 36,
  iconSize: 22,
  gapToLabel: 4,
} as const

export const WORKSPACE_DRAWER_COPY = {
  title: '工作区',
  countUnit: '项',
  internalCollapseGlyph: '',
} as const
