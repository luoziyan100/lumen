export const SYSTEM_PROMPT_COPY = {
  nav: '系统提示词',
  title: '系统提示词',
  hint: '这里编辑的是系统提示词,会作为 Lumen 的系统级指令跨会话生效。适合写它必须长期遵守的规则,比如引用格式、回答语言、详略习惯。',
  placeholder: '例:你是 Lumen,一个严谨的研究伙伴。引用论文时带 DOI;先给结论再给论证;用中文回答。',
} as const

/** 设置 · 后台常驻(LaunchAgent) */
export const BACKGROUND_SERVICE_COPY = {
  nav: '后台服务',
  title: '后台常驻服务',
  hint: '用 macOS LaunchAgent 托管 agent-service:登录即起、崩溃或睡眠后由系统拉回。关闭后仅在打开 App 时临时拉起。',
  on: '已开启常驻',
  off: '未开启常驻',
  enable: '开启常驻',
  disable: '关闭常驻',
  alive: '服务在线',
  dead: '服务未在线(稍候或点回窗口)',
  unavailable: '当前不是桌面壳,请用终端: npm run launchd:install -w packages/agent-service',
} as const
