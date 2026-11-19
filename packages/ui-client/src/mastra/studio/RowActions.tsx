/**
 * [INPUT]: Kumo DropdownMenu, Dialog and Button (the board tab's 「⋯」 menu and delete dialog are the model), the shared MoreIcon, copyText, the studio.row catalog
 * [OUTPUT]: ActionRow: one list row of a topic or a conversation with its 「⋯」 menu — Rename · Copy ID · Archive ─ Delete (R18–R21); a double click on the row renames too.
 *           Rename turns the title into an inline input with the text selected (Enter or blur saves, Esc cancels, empty keeps the old title); Copy ID shows 「已复制」 for about
 *           a second; Archive and Delete are disabled while the row runs or waits, the reason in the item's title (as on the board tab); Delete asks once in a dialog
 *           whose Cancel has the focus; RemoveDialog: that dialog, also used by Settings › Archived
 * [POS]: shared by the topic pane (TopicPanel) and the sprite's conversation list (Sprite) so both lists behave alike; it calls back and never talks to the service.
 *        Refusals come back as thrown errors, which the owner shows in its pane's alert line. No ID is ever shown as text
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { MoreIcon } from '../../components/icons'
import { copyText } from '../../components/clipboard.ts'
import { useT } from '../../i18n/index.ts'

export type RowKind = 'topic' | 'session'

/** The one confirmation of a delete (R20): a title, one consequence line, Cancel (focused) and Delete. */
export function RemoveDialog({ kind, name, onCancel, onConfirm }: { kind: RowKind; name: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const R = useT().studio.row
  const [removing, setRemoving] = useState(false)
  const title = kind === 'topic' ? R.removeTopic(name) : R.removeSession(name)
  async function confirm() {
    setRemoving(true)
    try { await onConfirm() } finally { setRemoving(false) }
  }
  // Cancel comes first, so the dialog's initial focus lands on it
  return <Dialog.Root role="alertdialog" open onOpenChange={open => { if (!open && !removing) onCancel() }}>
    <Dialog className="ext-link-modal row-remove-modal p-0">
      <Dialog.Title className="ext-link-title">{title}</Dialog.Title>
      <Dialog.Description className="ext-link-hint">{kind === 'topic' ? R.removeTopicBody : R.removeSessionBody}</Dialog.Description>
      <div className="ext-link-actions">
        <Button variant="secondary" disabled={removing} onClick={onCancel}>{R.cancel}</Button>
        <Button variant="destructive" disabled={removing} onClick={() => void confirm()}>{R.confirm}</Button>
      </div>
    </Dialog>
  </Dialog.Root>
}

function RenameField({ initial, label, placeholder, onDone }: { initial: string; label: string; placeholder: string; onDone: (title: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null), done = useRef(false)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  // Enter and blur save once; Esc leaves without saving. Empty or unchanged saves nothing
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const title = input.current?.value.trim() ?? ''
    onDone(save && title && title !== initial ? title : null)
  }
  return <input ref={input} className="studio-field row-rename" aria-label={label} placeholder={placeholder} defaultValue={initial} onBlur={() => finish(true)}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); finish(true) }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false) }
    }} />
}

export function ActionRow({ kind, copyId, title, untitled, selected, busy, className, deferSelect, onSelect, onRename, onArchive, onRemove, children }: {
  kind: RowKind
  /** What Copy ID puts on the clipboard: topicId, or topicId:taskId (R21) */
  copyId: string
  /** null: untitled (a conversation before its first message, L8) */
  title: string | null
  untitled: string
  selected: boolean
  /** Running or waiting: Archive and Delete are off (R19/R20); Rename and Copy ID stay */
  busy: boolean
  className: string
  /** The sprite's list closes on a pick, so a click waits a moment to see whether it becomes a double click (rename); a keyboard pick goes at once */
  deferSelect?: boolean
  onSelect: () => void
  /** The three actions report their own refusals (the pane's alert line) and never throw */
  onRename: (title: string) => Promise<void>
  onArchive: () => Promise<void>
  onRemove: () => Promise<void>
  /** The row's contents after the title: status light, unread mark */
  children?: ReactNode
}) {
  const R = useT().studio.row
  const name = title ?? untitled
  const [editing, setEditing] = useState(false), [copied, setCopied] = useState(false), [removing, setRemoving] = useState(false)
  const removeAfter = useRef(false), click = useRef<number | undefined>(undefined), renameSoon = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(click.current); window.clearTimeout(renameSoon.current) }, [])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])
  // Rename unmounts the menu with its trigger, so the focus the closing menu hands back has nowhere to land; it starts a task later, once the menu's click is done.
  // The dialog leaves the menu mounted, so it waits until the menu has finished closing and handed focus back, or that focus would leave the dialog at once
  const rename = () => { renameSoon.current = window.setTimeout(() => setEditing(true), 0) }
  return <li className={`action-row${selected ? ' is-on' : ''}${editing ? ' is-editing' : ''}`}>
    {editing
      ? <RenameField initial={title ?? ''} label={R.renameLabel(name)} placeholder={untitled} onDone={next => { setEditing(false); if (next) void onRename(next) }} />
      : <button type="button" className={className} aria-current={selected ? 'page' : undefined} title={name}
        onClick={event => {
          if (!deferSelect || event.detail === 0) { onSelect(); return }
          window.clearTimeout(click.current)
          if (event.detail === 1) click.current = window.setTimeout(onSelect, 250)
        }}
        onDoubleClick={() => { window.clearTimeout(click.current); setEditing(true) }}>
        <span className="action-row-title">{name}</span>{children}
      </button>}
    {!editing && <DropdownMenu onOpenChangeComplete={open => {
      if (open || !removeAfter.current) return
      removeAfter.current = false
      setRemoving(true)
    }}>
      <DropdownMenu.Trigger render={<button type="button" className="icon-btn action-row-more" aria-label={R.more(name)} title={R.more(name)} />}><MoreIcon size={16} /></DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" sideOffset={6} className="glass-card">
        <DropdownMenu.Item onClick={rename}>{R.rename}</DropdownMenu.Item>
        <DropdownMenu.Item onClick={() => { void copyText(copyId).then(() => setCopied(true)) }}>{R.copyId}</DropdownMenu.Item>
        <DropdownMenu.Item disabled={busy} title={busy ? R.busy : undefined} onClick={() => void onArchive()}>{R.archive}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item variant="danger" disabled={busy} title={busy ? R.busy : undefined} onClick={() => { removeAfter.current = true }}>{R.remove}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>}
    {copied && <span className="action-row-copied" role="status">{R.copied}</span>}
    {removing && <RemoveDialog kind={kind} name={name} onCancel={() => setRemoving(false)} onConfirm={async () => { try { await onRemove() } finally { setRemoving(false) } }} />}
  </li>
}
