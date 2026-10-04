# disclosure/
> L2 | 父级: ../CLAUDE.md

- `CurtainFold.tsx`：恢复原三层 grid/pane/veil；开合持续挂载并屏蔽关闭内容焦点，动画只消费原全局样式和 token。
- `Disclosure.tsx`：新增详情入口的语义按钮与局部开合状态；复用原箭头和 CurtainFold，不使用瞬间关闭的原生 details。
- `UserText.tsx`：长用户输入的预览/全文卷帘切换，附件在折叠区外；收起完成才恢复预览，反向切换撤销旧计时。
- `disclosure.css`：详情按钮的局部排版和焦点；不定义第二套动画。

边界：原版有独立标题的侧栏、思考、过程和目录直接用 CurtainFold；新详情用 Disclosure。浮层菜单和左右整栏仍走原各自交互，不混用纵向卷帘。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
