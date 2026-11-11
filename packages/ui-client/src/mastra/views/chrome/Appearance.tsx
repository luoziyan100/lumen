/**
 * [INPUT]: AppearanceState + onChange、统一 Phosphor 勾选图标
 * [OUTPUT]: PreferencePane：整窗皮肤、真实明暗及背景效果选择；点选皮肤同步推荐模式与材质
 * [POS]: Mastra 设置的外观页；复用迁移前皮肤控件，偏好仅保存在本机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { AppearanceMode, AppearanceState, SkinDefinition } from '../../../appearance'
import { coerceSkinId, listSkins } from '../../../appearance'
import { CheckIcon, ICON_SM } from '../../../components/icons'

const MODE_ITEMS: { id: AppearanceMode; label: string }[] = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'system', label: '跟随系统' },
]

export function PreferencePane({
  state,
  onChange,
}: {
  state: AppearanceState
  onChange: (partial: Partial<AppearanceState>) => void
}) {
  const skins = listSkins()
  const activeId = coerceSkinId(state.skinId)

  return (
    <div className="pref-pane">
      <div className="mp-head">
        <h2 className="settings-h">外观</h2>
      </div>
      <p className="set-hint pref-hint">
        选择一套皮肤，立即切换整窗配色与材质。外观偏好仅保存在本机。
      </p>

      <section className="pref-section">
        <h3 className="pref-h">外观模式</h3>
        <div className="pref-mode-row" role="group" aria-label="外观模式">
          {MODE_ITEMS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pref-mode-btn${state.mode === m.id ? ' is-active' : ''}`}
              aria-pressed={state.mode === m.id}
              onClick={() => onChange({ mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">皮肤 <span className="pref-h-req">必选 · 当前 {skins.find((s) => s.id === activeId)?.name ?? '青瓷默认'}</span></h3>
        <div className="pref-skin-grid" role="radiogroup" aria-label="皮肤">
          {skins.map((s) => (
            <SkinCard
              key={s.id}
              skin={s}
              active={activeId === s.id}
              onSelect={() => onChange({ skinId: s.id, mode: s.preferredScheme })}
            />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">背景遮罩</h3>
        <label className="pref-slider">
          <span className="pref-slider-label">{Math.round(state.overlay * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(state.overlay * 100)}
            onChange={(e) => onChange({ overlay: Number(e.target.value) / 100 })}
            aria-label="背景遮罩强度"
          />
        </label>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">背景模糊</h3>
        <label className="pref-slider">
          <span className="pref-slider-label">{state.blurPx}px</span>
          <input
            type="range"
            min={0}
            max={40}
            value={state.blurPx}
            onChange={(e) => onChange({ blurPx: Number(e.target.value) })}
            aria-label="背景模糊像素"
          />
        </label>
      </section>
    </div>
  )
}

function SkinCard({
  skin,
  active,
  onSelect,
}: {
  skin: SkinDefinition
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      className={`pref-skin-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-checked={active}
      aria-label={`${skin.name}${active ? '（已选）' : ''}`}
    >
      <span
        className="pref-skin-swatch"
        style={{ backgroundImage: skin.preview }}
        aria-hidden
      >
        {skin.accents && skin.accents.length > 0 ? (
          <span className="pref-skin-dots">
            {skin.accents.map((c) => (
              <span key={c} className="pref-skin-dot" style={{ background: c }} />
            ))}
          </span>
        ) : null}
      </span>
      <span className="pref-skin-meta">
        <span className="pref-skin-name">{skin.name}</span>
        {skin.description ? <span className="pref-skin-desc">{skin.description}</span> : null}
        <span className="pref-skin-badge">{skin.preferredScheme === 'light' ? '浅色' : '深色'} · {skin.material === 'paper' ? '纸面' : '玻璃'}</span>
      </span>
      {active ? <span className="pref-skin-check" aria-hidden><CheckIcon size={ICON_SM} /></span> : null}
    </button>
  )
}
