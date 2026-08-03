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

/** 侧栏:项目树(仅用户创建) + 最近(历史平铺,不是项目) */
export const SIDEBAR_PROJECT_COPY = {
  section: '项目',
  recent: '最近',
  newChat: '新对话',
  search: '搜索',
  emptyProjects: '还没有项目。点上方「新建项目」创建。',
  emptyRecent: '还没有对话。',
  empty: '还没有项目。',
  offline: '服务未连接',
  offlineHint: 'agent-service 不在线。桌面版请刷新窗口以补拉;确认 127.0.0.1:8787 已监听(勿依赖 localhost/IPv6)。',
  /** 点项目行 + 后出现的临时项;发消息成真会话,未发言离开则消失 */
  draftChat: '新建对话',
  newChatInProject: '在此项目新建会话',
  newProject: '新建项目',
  namePlaceholder: '项目名称',
  /** 次要点击(触控板双指点按 / 鼠标右键)后露出 */
  copySessionId: '复制会话 ID',
  copiedSessionId: '已复制会话 ID',
  archiveChat: '归档对话',
  secondaryClickHint: '双指点按或右键：复制 / 归档',
} as const

export const CREATE_PROJECT_COPY = {
  title: '创建项目',
  nameLabel: '项目名称',
  namePlaceholder: '项目名称',
  folderLabel: '源文件夹',
  folderHint: '添加 Lumen 可读取的本地文件夹(可选)',
  folderChosen: '已选择',
  folderClear: '清除',
  folderPaste: '或粘贴路径…',
  cancel: '取消',
  submit: '创建项目',
} as const

export const WORKSPACE_SCOPE_COPY = {
  shared: '共享区',
  session: '本会话',
  uploadShared: '上传到共享区',
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

/** 对话流等待态(Dot Matrix + 文案) */
export const APP_STATUS_COPY = {
  thinking: '思考中',
} as const
