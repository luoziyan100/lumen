# transcript/
> L2 | 父级: ../CLAUDE.md

- `content.ts`：原生消息的纯展示投影，提取当前任务/项目附件和用户轮次；不修改存储，不请求外部 URL。
- `Message.tsx`：用户正文折叠、历史图片/文件呈现与消息复制，附件始终在折叠正文之外。
- `TurnRail.tsx`：四轮起展示旧圆点导航和摘要，滚动定位限定会话容器，预览卡对齐选中轮次；宽度与阅读器隐藏由原chat-stage规则控制。
- `transcript.css`：复用原消息动作、附件与轮次轨道视觉，仅补齐 Mastra 宿主选择器。

长用户文本开合交给共享 `components/disclosure/UserText`：预览与全文走原卷帘时序，附件始终在折叠区外，关闭完成后才恢复预览。消息生命周期属于 Mastra；本模块仅持有阅读、复制反馈和导航焦点，文件交给当前会话阅读器。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
