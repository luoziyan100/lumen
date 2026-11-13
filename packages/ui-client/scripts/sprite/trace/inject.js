/**
 * [INPUT]: 调试窗口的 Tauri invoke 与桌面根的真实 data-state
 * [OUTPUT]: 桌面 React 提交的时间记录；不修改产品负载或状态流
 * [POS]: 仅调试构建的初始化脚本，观察真实 DOM，正式网页不导入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  const invoke = window.__TAURI_INTERNALS__.invoke
  let previous
  new MutationObserver(() => {
    const state = document.querySelector('.sprite-root')?.getAttribute('data-state')
    if (!state || state === previous) return
    previous = state
    void invoke('record_sprite_trace', { kind: 'rendered', state, at: Date.now() }).catch(() => {})
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
})()
