/** 图标唯一入口:一律 @phosphor-icons/react(Kumo 同源家族),经此单点 re-export。
 *  规范见 doc/ui-design.md「§3.1 图标规范」:三档尺寸 + weight 全站统一 regular;
 *  禁手写 SVG / 字符凑图标(← › × ＋) / emoji / 绕过本文件直接 import phosphor。 */
import { ArrowUp, CaretLeft, CaretRight, Gear, MagnifyingGlass, Plus, SidebarSimple, User, X } from '@phosphor-icons/react'

// 尺寸三档:行内(列表/标签内) / 按钮内 / 导航按钮
export const ICON_SM = 16
export const ICON_MD = 18
export const ICON_LG = 20

export function PanelIcon({ size = ICON_LG }: { size?: number }) {
  return <SidebarSimple size={size} />
}

export function SearchIcon({ size = ICON_LG }: { size?: number }) {
  return <MagnifyingGlass size={size} />
}

export function PlusIcon({ size = ICON_MD }: { size?: number }) {
  return <Plus size={size} />
}

export function SendIcon({ size = ICON_MD }: { size?: number }) {
  return <ArrowUp size={size} />
}

export function GearIcon({ size = ICON_MD }: { size?: number }) {
  return <Gear size={size} />
}

export function BackIcon({ size = ICON_MD }: { size?: number }) {
  return <CaretLeft size={size} />
}

export function CloseIcon({ size = ICON_MD }: { size?: number }) {
  return <X size={size} />
}

/** 折叠展开指示:CaretRight 旋转(展开态转 90°) */
export function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <CaretRight
      size={ICON_SM}
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-fast) var(--ease-out)' }}
    />
  )
}

/** 账户头像:User regular(轮廓款,owner 定;全站 weight 统一 regular,无例外) */
export function AccountIcon({ size = ICON_LG }: { size?: number }) {
  return <User size={size} />
}
