/**
 * [INPUT]: AgentClient;ensureAgentService
 * [OUTPUT]: connected + protocolMismatch —— 断线打回 false 并自动重连;版本不匹配只提示
 * [POS]: App 连接生命周期;睡眠常弄死 Node sidecar,重连前先请壳 ensure
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import type { AgentClient } from '../agent-client'
import { ensureAgentService } from '../ensureAgent'

export function useServiceConnection(client: AgentClient): { connected: boolean; protocolMismatch: boolean } {
  const [connected, setConnected] = useState(false)
  const [protocolMismatch, setProtocolMismatch] = useState(false)
  useEffect(() => {
    let live = true
    let retry: ReturnType<typeof setTimeout> | null = null
    const connect = (askShell = false): void => {
      void (async () => {
        if (askShell) await ensureAgentService()
        if (!live) return
        client.connect()
          .then(() => { if (live) setConnected(true) })
          .catch(() => {
            if (!live) return
            setConnected(false)
            retry = setTimeout(() => connect(true), 1200)
          })
      })()
    }
    const offHello = client.onHello(() => {
      if (live) setProtocolMismatch(client.protocolMismatch)
    })
    const offClose = client.onClose(() => {
      if (!live) return
      setConnected(false)
      retry = setTimeout(() => connect(true), 800)
    })
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !live) return
      if (!client.connected) connect(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    connect(true)
    return () => {
      live = false
      offHello()
      offClose()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (retry) clearTimeout(retry)
      client.close()
    }
  }, [client])
  return { connected, protocolMismatch }
}
