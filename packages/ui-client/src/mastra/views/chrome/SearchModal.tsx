/**
 * [INPUT]: 完整 SessionInfo 目录与工作台选中回调，既有 Kumo CommandPalette
 * [OUTPUT]: SearchModal：⌘K 标题/ID 快跳，方向键导航、回车打开、Escape 关闭
 * [POS]: 独立快捷导航浮层，完整会话页仍承担项目筛选和分页档案
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react'
import { CommandPalette } from '@cloudflare/kumo/components/command-palette'
import type { SessionInfo } from '../../data/client'

interface ConvItem { id: string; title: string; task: SessionInfo }
interface ConvGroup { id: string; label: string; items: ConvItem[] }

export function SearchModal({ open, onOpenChange, conversations, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: SessionInfo[]
  onSelect: (task: SessionInfo) => void
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo<ConvGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const shown = q
      ? conversations.filter((t) => `${t.title} ${t.taskId}`.toLowerCase().includes(q))
      : conversations
    return [{
      id: 'conversations',
      label: '会话',
      items: shown.map((t) => ({ id: `${t.projectId}:${t.taskId}`, title: t.title || '新对话', task: t })),
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
                      {(item.task.running || item.task.waiting) && <span className="sb-lamp is-running" title={item.task.waiting ? '等待处理' : '进行中'}><span className="sb-lamp-dot" /></span>}
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
