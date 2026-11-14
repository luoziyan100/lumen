/**
 * [INPUT]: doc/studio/model.md 的功能命名（白板 · 沉淀 · 概念图 · 灵感 · 全部）与 P0 交互
 * [OUTPUT]: STUDIO_COPY：新外壳的词表——视图名、白板/区块/素材（搜索、上传）/精灵/状态灯、面板收放与阅读器文案；精灵打开说明带空闲/正在画/在等你/正在说状态
 * [POS]: 新形态文案单源。视图名集中在 views，P3 换世界观（书房 / 实验室 / 工坊）时只换这张表，不改结构
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const STUDIO_COPY = {
  // ---- 词表：中间的标签。P0 只有白板可用，其余如实占位 ----
  views: {
    board: { label: '白板', available: true },
    settled: { label: '沉淀', available: false, later: '沉淀区还没开放：这里将放这个主题里想清楚的部分，每条带验证等级。' },
    map: { label: '概念图', available: false, later: '概念图还没开放：这里将连起这个主题里出现过的概念。' },
    ideas: { label: '灵感', available: false, later: '灵感还没开放：这里将放你自己随手记下的念头，AI 只读不改。' },
    all: { label: '全部', available: false, later: '「全部」还没开放：这里将平铺这个主题的白板、沉淀和材料。' },
  },
  topics: '主题', newTopic: '新主题', newTopicPlaceholder: '一个好奇的问题，回车创建', cancel: 'Esc 取消', noTopics: '还没有主题。写下一个你好奇的问题，开一个。',
  pickTopic: '选一个主题，或新建一个。',
  light: { running: 'AI 在运行', waiting: '等你' },
  board: {
    frameNote: '这张白板只放一个问题', frameFull: '这张白板已经写满', folded: '已收起',
    empty: '白板还是空的。和 AI 聊起来，它会把想清楚的东西画在这里。',
    noLive: '这个主题现在没有进行中的白板。点 ＋ 新开一张。',
    newSheet: '新开一张白板', drawing: 'AI 正在画', updating: 'AI 正在改这一块',
    zoomIn: '放大', zoomOut: '缩小', fit: '看全貌',
    by: 'AI 画的', inferred: 'AI 推断', fromConversation: '来自对话',
    superseded: '已被取代', supersededBy: (title: string) => `已被取代 → ${title}`, settled: '已沉淀',
    here: '你在这里', broken: '— 梯子在这里断 —', fog: '还没走到', guess: '？ 留给你猜',
    widgetIdle: '小部件没在运行（同时最多运行两个）', widgetRun: '运行它',
  },
  card: {
    running: { draw: '正在白板上画', update: '正在改白板', supersede: '正在标为已取代' },
    done: { draw: '在白板上画了', update: '改了白板上的', supersede: '标为已取代' },
    failed: '没画上',
  },
  materials: {
    title: '素材',
    none: '还没有素材。上传文件，或把链接发给对话里的 AI。',
    search: '搜索素材', noMatch: '没有匹配的素材',
    upload: '上传文件', uploading: '正在上传…', remove: '不再引用',
    close: '关闭', loading: '正在打开…', unsupported: '这种格式还不能在这里预览。',
  },
  panes: {
    left: { collapse: '收起主题栏', expand: '展开主题栏', key: '⌘B', keys: 'Meta+B' },
    right: { collapse: '收起素材栏', expand: '展开素材栏', key: '⌘⌥B', keys: 'Meta+Alt+B' },
  },
  reader: {
    full: '铺满中栏', restore: '还原分屏 Esc', open: '用系统打开', close: '关闭阅读器', copy: '复制源码', copied: '已复制',
    splitter: '拖动调整白板与原文的宽度，双击回到各一半',
  },
  sprite: {
    open: '点开对话（可拖动）', collapse: '收回成球', dock: '停靠到右侧', float: '恢复浮动', conversations: '这个主题的对话',
    openWith: { idle: '点开对话（可拖动）', running: '打开对话 · AI 正在画', waiting: '打开对话 · 在等你', speaking: '打开对话 · AI 正在说' },
    newConversation: '新对话', back: '回到对话',
    busy: 'AI 还在这个主题里运行或在等你回应——先等它画完，或者停下它，再开新对话。',
    hint: '换对话不会换白板：白板和材料属于整个主题，对话只是说话的记录。',
    untitled: '新对话', diagnostics: '诊断',
  },
  app: 'Lumen', settings: '设置',
} as const
