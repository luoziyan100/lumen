/**
 * [INPUT]: 新研究工作台的用户动作与连接状态
 * [OUTPUT]: MASTRA_COPY：迁移后产品文案
 * [POS]: 新入口文案单源，不把底层 SDK 细节放进研究流程
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const MASTRA_COPY = {
  brand: 'Lumen', projects: '项目', sessions: '研究会话', newSession: '新研究', newProject: '新建项目', projectName: '项目名称',
  create: '创建', cancel: '取消', rename: '重命名', pin: '置顶', unpin: '取消置顶', archive: '归档', save: '保存',
  showArchived: '查看归档', showCurrent: '查看当前', restore: '恢复', searchSessions: '搜索会话名称', renameProject: '重命名项目', archiveProject: '归档项目',
  welcome: '从一份材料，开始研究。', introduction: '上传论文，核对证据，把想法写成有出处的笔记。',
  placeholder: '问点什么…', send: '发送', stop: '停止', attach: '添加材料', uploading: '正在上传材料…',
  connected: '已连接', connecting: '正在连接', retry: '重新连接', busy: '研究中', ready: '就绪',
  workspace: '工作区', noFiles: '这个目录还没有文件', up: '上级目录', refresh: '刷新', close: '关闭',
  allow: '允许', deny: '拒绝', approval: '需要确认操作', answer: '回答', question: '需要你的补充',
  children: '专家任务', stopChild: '停止专家', working: '执行中', tools: '工具过程', showResult: '查看结果',
  user: '你', assistant: 'Lumen', failure: '操作未完成', next: '下一页', previous: '上一页',
  draftNote: 'Enter 发送 · Shift+Enter 换行', loading: '正在读取…', readError: '无法读取文件',
  unsupported: '该文件已保存在工作区。', download: '保存到本机', title: '会话名称', noSessions: '创建第一项研究',
  noConnection: '研究服务尚未就绪', retryConnection: '重新打开应用以连接研究服务。',
  skills: '研究技能', skillsHint: '选择一个研究流程，将它加入当前草稿。', skillArgs: '本次研究的要求（可选）', noSkills: '还没有安装技能',
  useSkill: '加入草稿', remove: '移除', projectScope: '当前项目', userScope: '所有项目', skillScope: '安装范围', installSkill: '安装 Markdown 技能',
  settings: '设置', settingsHint: '模型凭证保存在本机。模型选择对新对话生效；完整配置变更需在研究空闲时保存。', profileName: '配置名称', modelId: '当前模型', modelProfile: '模型配置',
  active: '已启用', activate: '启用', addProfile: '添加模型配置', provider: '接口协议', models: '可用模型（每行一个）', keyKept: '已保存，留空保持原密钥', enterKey: '输入 API Key',
  instructions: '研究偏好', saveInstructions: '保存研究偏好', saved: '已保存', contextWindow: '上下文窗口（可选）', vision: '图片理解', auto: '自动', enabled: '开启', disabled: '关闭',
  childStatus: { pending: '等待执行', running: '研究中', suspended: '等待补充', completed: '已完成', failed: '未完成', cancelled: '已停止', canceled: '已停止' },
  fileScope: '文件范围', taskFiles: '当前研究', sharedFiles: '项目资料', sourceFiles: '外部资料', projectMemory: '项目记忆',
  sourceReadOnly: '外部资料仅供读取，研究结果保存在当前研究或项目资料。', emptyFile: '这个文件为空。',
  taskList: '研究任务', taskStatus: { pending: '待完成', in_progress: '进行中', completed: '已完成' },
  tokenUsage: '累计用量', inputTokens: '输入', outputTokens: '输出', cachedTokens: '缓存命中', reasoningTokens: '推理',
  previewImage: '图片预览', waitingAnswer: '等待你的回应', queuedMessages: '等待继续的消息', submitting: '正在提交…', stopping: '正在停止…',
  uploadedMaterials: '已上传材料（工作区路径）：', sendFailed: '消息未提交', restoreDraft: '恢复到草稿', multipleAnswers: '可以选择多项', otherAnswer: '其他回答或补充',
} as const
