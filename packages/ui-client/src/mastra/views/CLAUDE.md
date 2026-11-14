# views/
> L2 | 父级: ../CLAUDE.md

- `Conversation.tsx`：可复用父级 session（精灵收起仍监听、展开只渲染，避免重复订阅和隐藏确认已读）；原生消息与任务/用量、审批/追问；原生reasoning独立思考轨迹默认折叠并结束收口；工具按轮次合卡，运行首次展开、用户控制开合、最近六步窗口，成功定稿隐藏过程、失败/未完成保留，工具轮公开旁白收入Thought；原光圈/点云球恢复，累计用量放入右轨折叠区，恢复chat-stage/messages/messages-content与原消息壳；滚动区随输入坞高度让位，轮次轨在窄栏/阅读器下按原规则隐藏；审批/问询与进行中的专家任务挂输入坞上方(完成的不占对话流)，对话底部始终是最新消息，1.82 的并行 pendingApprovals 逐条展示，审批/回答命令 ack 未认领时如实报错；服务端专家目录(在 studio 精灵的对话列表里)支持用户明确补充新任务后继续，等待原审批不重复提交；恢复历史附件、消息复制、长用户正文折叠与轮次轨道；已有子任务轮询同步专家派生用量，停止后晚到结果仍可见；工具活动只展示原生进行态，完成/失败结果留在历史；上滑或离开底部后停止追新，程序贴底不恢复跟随，回到最新才重新贴底并确认可见已读；切任务隔离迟到结果，可见且跟随底部时确认持久消息游标，相对引用在阅读器打开；白板工具（board_draw/update/supersede）只显示为卡片（R6），点卡经 onFocusBlock 跳到那块，「正在画/已写完」经 onBoard 交给外壳触发白板重取；会话投影拆分稳定历史与当前轮，widget 发送回调保持引用稳定。
- `reader/DocumentReader.tsx`：单文档阅读器（取代 S2 的 Files 目录轨，只留阅读）：资料库条目（scope=library，不需会话身份）或主题工作区/记忆文件；头部依次为类别轮廓（不用格式文字徽标）、标题（占满剩余宽度，真放不下才省略，title 全名）、铺满/还原、复制源码、系统打开（桌面里资料库条目只把 id 交给原生 `open_library_item`，工作区文件走 `open_workspace_file`，浏览器退回保存）、保存（仍是保存对话框，无扩展名按原件类型补）、关闭，两端可插入面板展开按钮；PDF 按宽适配；HTML/PDF/Markdown/图像沿原沙箱边界预览，相对链接与 PDF 页码；运行中每五秒先用 ETag 检查，未变复用预览、变了才换正文。
- `Skills.tsx`：技能发现、管理安装/移除，只有用户层；选择回到输入卡技能菜单，不重复添加参数栏；目录上传保留脚本/资源/空目录和执行位，在任务私有临时目录校验后原子安装。
- `Settings.tsx`：原横向set-row表单、逐行模型增减、统一图标的供应商卡操作与密钥掩码；模型、研究偏好、专家与外观四个分类在运行中仍可浏览，仅保存请求与专家写入阻止切页和关闭；模型配置和研究偏好写入遵守运行门禁，外观本机即时切换；不提供研究预算编辑，服务端用量与运行保护保留；模型价格按具体模型关联，费用未知不估算。
- `chrome/`：皮肤面板与独立宽度拖拽交互。
- `conversation/`：草稿/附件、原生任务用量和多选追问的局部呈现；思考/过程、专家与长输入共用原卷帘，关闭保留内容和草稿。
- `workbench.css`：复用原 titlebar/sidebar/chat/composer/reader 形制、tokens与图标组件尺寸，不再重缩放导航轮廓；PDF 面板约束纵向高度并独立滚动，宽页完整保留横向滚动范围、页面不被 flex 压缩；移除泛化label规则以免污染外观滑杆；S4 起旧文件轨/文档居中/过渡入口样式退场（备份见 ~/Workspace/tmp/studio-retired/2026-11-12-S4/），新外壳样式在 ../studio/studio.css。

卷帘边界：思考/过程和目录使用 `components/disclosure/CurtainFold`；新增模型价格、专家、用量等详情用 `Disclosure`，收起保留草稿。浮层菜单、左右整栏显隐继续沿各自原交互。

Language (i18n): views read `useT()`; tool names, role names and process labels resolve at render time from the catalog, so cached turn projections follow a language switch. Errors shown here use `errorText`, and service errors were already put into the UI language from their `code`. Text that goes to the model (uploaded-material list, current draft, Mermaid fix request) comes from `i18n/locales/model.ts` and stays Chinese.

错误呈现：`Conversation.tsx` 独立展示运行错误与连接错误；运行错误保持可见到下一轮开始，只有连接/读取错误提供重新连接入口，成功补取历史不代表模型执行成功。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
