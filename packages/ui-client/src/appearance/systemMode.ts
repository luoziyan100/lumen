/**
 * [INPUT]: window.matchMedia prefers-color-scheme
 * [OUTPUT]: resolveSystemScheme / subscribeSystemScheme
 * [POS]: appearance;mode=system 时折叠意图（宿主 color-scheme 仍固定 dark）
 */

export function resolveSystemScheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function subscribeSystemScheme(onChange: (scheme: 'dark' | 'light') => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => {
    onChange(mq.matches ? 'dark' : 'light')
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
