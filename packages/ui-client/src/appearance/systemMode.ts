/**
 * [INPUT]: window.matchMedia prefers-color-scheme
 * [OUTPUT]: resolveSystemScheme / subscribeSystemScheme
 * [POS]: 外观的系统适配边界；媒体查询只提供明暗，基线选择与实际应用交给 resolve/apply
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
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
