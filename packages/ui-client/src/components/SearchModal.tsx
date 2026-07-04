/**
 * 会话搜索(⌘K):Kumo CommandPalette 驱动——输入过滤会话,↑↓ 选择,↵ 打开,Esc 关闭。
 * 过滤在本组件内做(受控 value);选中即回调 onSelect(App 负责切会话与收起)。
 */
import { useMemo, useState } from 'react'
import { CommandPalette } from '@cloudflare/kumo/components/command-palette'
import type { Task } from '../agent-client'

interface ConvItem { id: string; title: string; task: Task }
interface ConvGroup { id: string; label: string; items: ConvItem[] }

export function SearchModal({ open, onOpenChange, conversations, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: Task[]
  onSelect: (task: Task) => void
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo<ConvGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const shown = q ? conversations.filter((t) => t.goal.toLowerCase().includes(q)) : conversations
    return [{
      id: 'conversations',
      label: '会话',
      items: shown.map((t) => ({ id: t.id, title: t.goal, task: t })),
    }]
  }, [conversations, query])

  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={(o: boolean) => { if (!o) setQuery(''); onOpenChange(o) }}
      items={groups}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(group: ConvGroup) => group.label}
      onSelect={(item: ConvItem) => onSelect(item.task)}
      getSelectableItems={(gs: ConvGroup[]) => gs.flatMap((g) => g.items)}
    >
      <CommandPalette.Input placeholder="搜索对话…" />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(group: ConvGroup) => (
            <CommandPalette.Group key={group.id} items={group.items}>
              <CommandPalette.GroupLabel>{group.label}</CommandPalette.GroupLabel>
              <CommandPalette.Items>
                {(item: ConvItem) => (
                  <CommandPalette.Item key={item.id} value={item} onClick={() => onSelect(item.task)}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="truncate">{item.title}</span>
                      {item.task.status === 'running' && <span className="sb-dot" />}
                    </span>
                  </CommandPalette.Item>
                )}
              </CommandPalette.Items>
            </CommandPalette.Group>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>没有匹配的会话</CommandPalette.Empty>
      </CommandPalette.List>
    </CommandPalette.Root>
  )
}
