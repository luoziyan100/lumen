import { useEffect, useMemo, useState } from 'react'
import type { ChatItem } from '../useAgent'
import { deriveAuraState } from './deriveAuraState'
import type { AuraState } from './states'

export function useAuraState({
  connected,
  running,
  items,
}: {
  connected: boolean
  running: boolean
  items: ChatItem[]
}): AuraState {
  const target = useMemo(() => deriveAuraState({ connected, running, items }), [connected, running, items])
  const [display, setDisplay] = useState<AuraState>(target)

  useEffect(() => {
    setDisplay(target)
    if (target !== 'done') return
    const timer = window.setTimeout(() => setDisplay('idle'), 2600)
    return () => window.clearTimeout(timer)
  }, [target])

  return display
}
