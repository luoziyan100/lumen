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
  /** 置顶区:在「项目」下、「最近」上;跨项目;本轮无拖拽 */
  pinned: '置顶',
  recent: '最近',
  newChat: '新对话',
  search: '搜索',
  emptyProjects: '还没有项目。点上方「新建项目」创建。',
  emptyRecent: '还没有对话。',
  empty: '还没有项目。',
  offline: '服务未连接',
  offlineHint: 'agent-service 不在线。已开常驻时稍候 launchd 会拉回;否则点回窗口或 Cmd+R。确认 127.0.0.1:8787 已监听(勿依赖 localhost/IPv6)。',
  staleService: '后台服务版本过旧，请重启 Lumen 后台服务(launchd)后重试',
  /** 点项目行 + 后出现的临时项;发消息成真会话,未发言离开则消失 */
  draftChat: '新建对话',
  newChatInProject: '在此项目新建会话',
  newProject: '新建项目',
  namePlaceholder: '项目名称',
  /** 项目树会话 >N 条时 Progressive Disclosure(见 visibleSessions) */
  showMoreSessions: '展开显示',
  showLessSessions: '收起',
  /** 会话灯:点圆 toggle 未读(Claude read/unread);空心=已读,实心=未读,脉动=运行中 */
  markUnread: '标为未读',
  markRead: '标为已读',
  lampRunning: '运行中',
  /** 次要点击(触控板双指点按 / 鼠标右键)后露出 */
  pinChat: '置顶',
  unpinChat: '取消置顶',
  renameChat: '重命名',
  copySessionId: '复制会话 ID',
  copiedSessionId: '已复制会话 ID',
  archiveChat: '归档对话',
  renameProject: '重命名',
  archiveProject: '归档项目',
  renamePlaceholder: '项目名称',
  renameChatPlaceholder: '会话名称',
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

/** ask_user 悬浮问询(见 doc/ask-user.md) */
/** 用户超长 prompt 折叠(9 行 / 750 字) */
export const MSG_FOLD_COPY = {
  expand: '展开全文',
  collapse: '收起',
}

/** 产物闭环:当前稿 chip */
export const ACTIVE_DOC_COPY = {
  chipPrefix: '当前',
  clear: '取消绑定当前稿',
} as const

export const ASK_USER_COPY = {
  title: '需要你的选择',
  questionN: '问题 ',
  /** 多题分页:「1 of 4」(对齐 Claude AskUserQuestion) */
  of: 'of',
  prev: '上一题',
  next: '下一题',
  pagerLabel: '题目切换',
  pageHint: '答完本题可切到下一题;全部答完后确认',
  /** 提交时写入 selected 的标记名(非 UI 展示) */
  otherLabel: '其他，并补充说明',
  /** 「其他」行 input 的幽灵占位,不占光标 */
  otherPlaceholder: '其他，并补充说明',
  notePlaceholder: '补充说明…',
  skip: '跳过',
  submit: '确认',
  waitingHint: '等待你的选择…',
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

/** 对话流等待态 / 滚动跳转 / 思考·工具轨迹 */
export const APP_STATUS_COPY = {
  thinking: '思考中',
  /** 模型连接重试（对齐 Codex Retry n/m） */
  retry: (attempt: number, maxAttempts: number) => `Retry ${attempt}/${maxAttempts}`,
  jumpToLatest: '回到最新',
  thoughtActive: '思考中',
  /** 收口后不再报秒数:边跑边想是多段,时长没意义 */
  thoughtSettled: 'Thought process',
  processTools: (n: number) => `${n} 个工具`,
  processMore: (n: number) => `+${n} 项更早`,
  processRecent: '只看最近',
  sourcesHeading: 'Sources',
  sourcesMore: (n: number) => `+${n} more`,
  sourcesLess: 'Show less',
  linkDialogTitle: '打开外部链接',
  linkDialogHint: '将离开 Lumen 访问：',
  linkDialogDontAsk: (host: string) => `不再询问 ${host} 的链接`,
  linkDialogCancel: '取消',
  linkDialogOpen: '打开链接',
} as const

/** 流程图失败卡 Phase B */
export const MERMAID_COPY = {
  repair: '尝试修复',
  repairing: '修复中…',
  repairFailed: '自动修复未成功',
  repairedHint: '图已在本地修正（历史消息正文未改）',
} as const

/** Skills 斜杠 / Manage */
export const SKILLS_COPY = {
  manageTitle: 'Manage skills',
  manageHint: 'Skills 是可运行的工作流包(SKILL.md + 可选 scripts/)',
  addFolder: '添加文件夹',
  addFile: '添加 SKILL.md',
  installToUser: '安装到全局',
  installToProject: '安装到本项目',
  uninstall: '卸载',
  empty: '尚未安装 Skill',
  layerUser: '全局',
  layerWorkspace: '本项目',
  layerSource: '源码树',
  slashFilter: '过滤 skills…',
  manageItem: 'Manage skills',
  menuSkills: 'Skills',
  menuAddFiles: '添加文件',
  activateFailed: '启动 Skill 失败',
  installFailed: '安装失败',
  uninstallFailed: '卸载失败',
  pickUnavailable: '请在桌面 App 中选择路径(或开发态粘贴)',
} as const
