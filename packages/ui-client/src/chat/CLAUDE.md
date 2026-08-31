# chat/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

事件→界面状态的纯函数核。useAgent hook 只订阅/投影,不内嵌归约分支。

## 成员

- `types.ts` — ChatItem 族与 ask_user / modelRetry 形;`ChatMsg.id` 是界面身份(封口继承 provisional)
- `todo.ts` — todo_write 解析与 upsert;safeParse
- `reduce.ts` — reduceUserFacingItems / reduceChatItems;无工具定稿继承 provisional UI ID,无泡时才用 event.id;seal / Thought 合并 / isLiveTaskEvent
