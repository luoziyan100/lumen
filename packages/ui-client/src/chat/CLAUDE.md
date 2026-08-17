# chat/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

事件→界面状态的纯函数核。useAgent hook 只订阅/投影,不内嵌归约分支。

## 成员

- `types.ts` — ChatItem 族与 ask_user / modelRetry 形
- `todo.ts` — todo_write 解析与 upsert;safeParse
- `reduce.ts` — reduceUserFacingItems(用户面) / reduceChatItems(证据面);seal / Thought 合并 / isLiveTaskEvent;write/edit path 优先 payload、回退 args、「完成(无 path)」
