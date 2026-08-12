/**
 * [INPUT]: useAppearance state/setAppearance; listSkins
 * [OUTPUT]: PreferencePane —— 设置「偏好」:外观模式 + 皮肤网格 + overlay/blur
 * [POS]: SettingsModal pane=preference;只写 AppearanceState,不碰 DOM
 * [PROTOCOL]: doc/appearance-skin.md Phase A
 */
import type { AppearanceMode, AppearanceState, SkinDefinition } from '../appearance'
import { listSkins } from '../appearance'

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

  return (
    <div className="pref-pane">
      <div className="mp-head">
        <h2 className="settings-h">偏好</h2>
      </div>
      <p className="set-hint pref-hint">
        外观与皮肤仅保存在本机，不写入模型配置。Phase A 以深色基线为准；选「浅色」时界面仍用深色 token（完整浅色主题后续提供）。
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
        <h3 className="pref-h">皮肤</h3>
        <div className="pref-skin-grid">
          {skins.map((s) => (
            <SkinCard
              key={s.id}
              skin={s}
              active={state.skinId === s.id}
              onSelect={() => onChange({ skinId: s.id })}
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
      className={`pref-skin-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={skin.name}
    >
      <span className="pref-skin-swatch" style={{ background: skin.preview }} />
      <span className="pref-skin-name">{skin.name}</span>
      {skin.preferredScheme === 'dark' ? (
        <span className="pref-skin-badge">深色</span>
      ) : null}
      {active ? <span className="pref-skin-check" aria-hidden>✓</span> : null}
    </button>
  )
}
