/**
 * [INPUT]: AppearanceState + onChange、桌面精灵本机开关、统一勾选图标
 * [OUTPUT]: PreferencePane：顶部界面语言（按各语言自称列出，即选即换），整窗皮肤（名称与说明随语言）、真实明暗、阅读字体与背景效果；桌面精灵入口由集中常量隐藏，保留代码便于恢复
 * [POS]: Mastra 设置的外观页；复用迁移前皮肤控件，偏好仅保存在本机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { AppearanceMode, AppearanceState, ReadingFontOption, SkinDefinition } from '../../../appearance'
import { CJK_FONTS, LATIN_FONTS, coerceCjkFont, coerceLatinFont, coerceSkinId, listSkins } from '../../../appearance'
import { CheckIcon, ICON_SM } from '../../../components/icons'
import { DESKTOP_SPRITE_ENABLED, useDesktopSpriteEnabled } from '../../studio/sprite-desktop/preference'
import { Select } from '@cloudflare/kumo/components/select'
import { localeNames, setLocale, useLocale, useT } from '../../../i18n/index.ts'

const MODES: AppearanceMode[] = ['dark', 'light', 'system']

export function PreferencePane({
  state,
  onChange,
}: {
  state: AppearanceState
  onChange: (partial: Partial<AppearanceState>) => void
}) {
  const { appearance: A, skins: skinCopy } = useT(), locale = useLocale()
  const skins = listSkins()
  const activeId = coerceSkinId(state.skinId)
  const [desktopSpriteEnabled, setDesktopSpriteEnabled] = useDesktopSpriteEnabled()

  return (
    <div className="pref-pane">
      <div className="mp-head">
        <h2 className="settings-h">{A.title}</h2>
      </div>
      <p className="set-hint pref-hint">{A.hint}</p>

      <section className="pref-section pref-language">
        <h3 className="pref-h">{A.language}</h3>
        <Select aria-label={A.language} size="sm" className="set-control pref-language-select" value={locale}
          items={Object.fromEntries(localeNames().map(entry => [entry.id, entry.nativeName]))} onValueChange={value => { void setLocale(value) }} />
      </section>

      <section className="pref-section">
        <h3 className="pref-h">{A.mode}</h3>
        <div className="pref-mode-row" role="group" aria-label={A.mode}>
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`pref-mode-btn${state.mode === mode ? ' is-active' : ''}`}
              aria-pressed={state.mode === mode}
              onClick={() => onChange({ mode })}
            >
              {A.modes[mode]}
            </button>
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">{A.readingFont}</h3>
        <div className="pref-font-grid">
          <FontRow label={A.latin} fonts={LATIN_FONTS} active={coerceLatinFont(state.latinFont)} onPick={(id) => onChange({ latinFont: id })} />
          <FontRow label={A.cjk} fonts={CJK_FONTS} active={coerceCjkFont(state.cjkFont)} onPick={(id) => onChange({ cjkFont: id })} />
        </div>
        <label className="pref-check">
          <input type="checkbox" checked={state.justify === true} onChange={(e) => onChange({ justify: e.target.checked })} />
          <span>{A.justify}</span>
        </label>
        <p className={`pref-font-sample${state.justify ? ' is-justify' : ''}`}>{A.sample}</p>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">{A.theme} <span className="pref-h-req">{A.themeCurrent(skinCopy[activeId]?.name ?? activeId)}</span></h3>
        <div className="pref-skin-grid" role="radiogroup" aria-label={A.theme}>
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
        <h3 className="pref-h">{A.overlay}</h3>
        <label className="pref-slider">
          <span className="pref-slider-label">{Math.round(state.overlay * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(state.overlay * 100)}
            onChange={(e) => onChange({ overlay: Number(e.target.value) / 100 })}
            aria-label={A.overlayLabel}
          />
        </label>
      </section>

      <section className="pref-section">
        <h3 className="pref-h">{A.blur}</h3>
        <label className="pref-slider">
          <span className="pref-slider-label">{state.blurPx}px</span>
          <input
            type="range"
            min={0}
            max={40}
            value={state.blurPx}
            onChange={(e) => onChange({ blurPx: Number(e.target.value) })}
            aria-label={A.blurLabel}
          />
        </label>
      </section>
      {DESKTOP_SPRITE_ENABLED && <section className="pref-section">
        <h3 className="pref-h">{A.desktopSprite}</h3>
        <label className="pref-check">
          <input type="checkbox" checked={desktopSpriteEnabled} onChange={event => setDesktopSpriteEnabled(event.target.checked)} />
          <span>{A.desktopSpriteHint}</span>
        </label>
      </section>}
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
  const { appearance: A, skins } = useT(), copy = skins[skin.id] ?? { name: skin.id, description: '' }
  return (
    <button
      type="button"
      role="radio"
      className={`pref-skin-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-checked={active}
      aria-label={`${copy.name}${active ? A.selected : ''}`}
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
        <span className="pref-skin-name">{copy.name}</span>
        {copy.description ? <span className="pref-skin-desc">{copy.description}</span> : null}
        <span className="pref-skin-badge">{skin.preferredScheme === 'light' ? A.light : A.dark} · {skin.material === 'paper' ? A.paper : A.glass}</span>
      </span>
      {active ? <span className="pref-skin-check" aria-hidden><CheckIcon size={ICON_SM} /></span> : null}
    </button>
  )
}

/** 每个选项用自身字体渲染名字，即选即见 */
function FontRow({ label, fonts, active, onPick }: { label: string; fonts: readonly ReadingFontOption[]; active: string; onPick: (id: string) => void }) {
  const { appearance: A, fonts: names } = useT()
  return (
    <div className="pref-font-row">
      <span className="pref-font-label">{label}</span>
      <div className="pref-mode-row" role="group" aria-label={A.fontGroup(label)}>
        {fonts.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`pref-mode-btn${active === f.id ? ' is-active' : ''}`}
            aria-pressed={active === f.id}
            style={{ fontFamily: f.family }}
            onClick={() => onPick(f.id)}
          >
            {names[f.id] ?? f.name}
          </button>
        ))}
      </div>
    </div>
  )
}
