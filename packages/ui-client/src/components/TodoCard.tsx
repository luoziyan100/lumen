/**
 * [INPUT]: useAgent 的 TodoChatItem;Kumo Collapsible
 * [OUTPUT]: TodoCard —— 对话流次要进度卡(主呈现见 UtilityRail Progress)
 * [POS]: 对话流一等 UI;与 ProcessRow 分离——Todo≠工具回放;见 doc/todo.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import type { TodoChatItem, TodoEntry } from '../useAgent'

function StepIcon({ status }: { status: TodoEntry['status'] }) {
  if (status === 'completed') {
    return <span className="todo-step-ic todo-step-ic-done" aria-hidden>✓</span>
  }
  if (status === 'in_progress') {
    return <span className="todo-step-ic todo-step-ic-run" aria-hidden />
  }
  return <span className="todo-step-ic todo-step-ic-pending" aria-hidden />
}

export function TodoCard({ todo }: { todo: TodoChatItem }) {
  const done = todo.todos.filter((t) => t.status === 'completed').length
  const n = todo.todos.length
  const allDone = n > 0 && done === n
  const [open, setOpen] = useState(!allDone)
  const title = todo.title?.trim() || '进度'

  useEffect(() => {
    if (allDone) setOpen(false)
  }, [allDone])

  return (
    <Collapsible.Root
      className={`todo-card${allDone ? ' is-complete' : ''}`}
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger className="todo-card-head">
        <span className={`todo-card-badge${allDone ? ' is-done' : ''}`} aria-hidden>
          {allDone ? '✓' : '☰'}
        </span>
        <span className="todo-card-title">{title}</span>
        <span className={`todo-card-count${allDone ? ' is-done' : ''}`}>{done}/{n}</span>
        <span className="todo-card-chev" aria-hidden>{open ? '⌃' : '⌄'}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="collapse-panel">
        <ul className="todo-steps">
          {todo.todos.map((t) => (
            <li key={t.id} className={`todo-step is-${t.status}`}>
              <StepIcon status={t.status} />
              <span className="todo-step-label">
                {t.status === 'in_progress' ? t.activeForm : t.content}
              </span>
              {t.status === 'in_progress' ? <span className="todo-step-tag">进行中</span> : null}
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

