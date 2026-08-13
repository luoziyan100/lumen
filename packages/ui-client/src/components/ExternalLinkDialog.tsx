/**
 * [INPUT]: pending url;trustedHosts;APP_STATUS_COPY
 * [OUTPUT]: ExternalLinkGate —— Claude 式外链确认;按域名可记住
 * [POS]: 包住对话列;Markdown / SourceList 点 http(s) 走这里
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { APP_STATUS_COPY } from '../appCopy'
import { hostOf } from '../sourceCite'
import { isTrustedHost, trustHost } from '../trustedHosts'
import { openExternalUrl } from '../openExternal'

const OpenExternal = createContext<(url: string) => void>((url) => {
  void openExternalUrl(url)
})

export function useOpenExternal(): (url: string) => void {
  return useContext(OpenExternal)
}

export function ExternalLinkGate({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null)
  const [remember, setRemember] = useState(false)
  const host = pending ? hostOf(pending) : ''

  const request = useCallback((url: string) => {
    const h = hostOf(url)
    if (h && isTrustedHost(h)) {
      void openExternalUrl(url)
      return
    }
    setRemember(false)
    setPending(url)
  }, [])

  function confirm(): void {
    if (!pending) return
    const url = pending
    if (remember && host) trustHost(host)
    setPending(null)
    void openExternalUrl(url).catch((err) => {
      console.error('[lumen] open external failed', err)
    })
  }

  return (
    <OpenExternal.Provider value={request}>
      {children}
      {pending ? (
        <Dialog.Root open onOpenChange={(o: boolean) => { if (!o) setPending(null) }}>
          <Dialog className="ext-link-modal p-0" aria-label={APP_STATUS_COPY.linkDialogTitle}>
            <h2 className="ext-link-title">{APP_STATUS_COPY.linkDialogTitle}</h2>
            <p className="ext-link-hint">{APP_STATUS_COPY.linkDialogHint}</p>
            <div className="ext-link-url">{pending}</div>
            {host ? (
              <label className="ext-link-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>{APP_STATUS_COPY.linkDialogDontAsk(host)}</span>
              </label>
            ) : null}
            <div className="ext-link-actions">
              <Button variant="ghost" onClick={() => setPending(null)}>
                {APP_STATUS_COPY.linkDialogCancel}
              </Button>
              <Button onClick={confirm}>{APP_STATUS_COPY.linkDialogOpen}</Button>
            </div>
          </Dialog>
        </Dialog.Root>
      ) : null}
    </OpenExternal.Provider>
  )
}
