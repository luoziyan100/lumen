# project/
> L2 | 父级: ../CLAUDE.md

- `CreateProjectModal.tsx`：恢复原创建项目悬浮卡；名称创建与可选资料绑定依次写入，绑定失败保留项目身份供重试，避免重复项目。
- `project.css`：原版420px无遮罩卡、名称输入和源目录选择样式，复用主题tokens。

边界：组合根提供API与完成/关闭回调；卡片保存未完成绑定状态，关闭后已创建项目仍由目录持有。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
