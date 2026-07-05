/** 图标唯一入口:一律取自 @phosphor-icons/react(Kumo 同源的图标家族),此处统一缺省尺寸。
 *  设计系统:不用 emoji;组件不得绕过本文件直接 import phosphor。 */
import { ArrowUp, CaretRight, MagnifyingGlass, Plus, SidebarSimple } from '@phosphor-icons/react'

export function PanelIcon({ size = 16 }: { size?: number }) {
  return <SidebarSimple size={size} />
}

export function SearchIcon({ size = 15 }: { size?: number }) {
  return <MagnifyingGlass size={size} />
}

export function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <CaretRight
      size={14}
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-fast) var(--ease-out)' }}
    />
  )
}

export function PlusIcon({ size = 16 }: { size?: number }) {
  return <Plus size={size} />
}

export function SendIcon({ size = 15 }: { size?: number }) {
  return <ArrowUp size={size} weight="bold" />
}
