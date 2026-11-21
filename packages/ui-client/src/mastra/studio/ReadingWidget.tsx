/**
 * [INPUT]: components/widget/WidgetFrame (the sandboxed page, its params channel and runtime-error report), Kumo Button/Select/Switch, components/icons (Ask, Chat, Expand, Collapse),
 *           i18n `studio.reading`, the block's declared WidgetParam list and the values Reading.tsx keeps (widget-params.ts)
 * [OUTPUT]: ReadingWidget: one active reading widget — the bar (name, a footprint mark once the person asked about it, the ask button, expand/collapse), the mounted WidgetFrame,
 *           the host-drawn control row under it (range = native input[type=range] on tokens with its readout and unit, toggle = Kumo Switch, choice = Kumo Select) and,
 *           when the page threw right after it started, one quiet failure line with 「请 AI 修正」
 * [POS]: split out of Reading.tsx's VisualBlock. It owns no state: values, failures and questions belong to ReadingView, so a rewrite of the section, an expand or a
 *        question never resets them. The control row sits inside the stage, so it travels with the expanded view; the iframe is never remounted (load count stays 1).
 *        The ask button and the footprint hide while expanded: the expanded stage is for looking, and the window opens in the column
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useRef } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Select } from '@cloudflare/kumo/components/select'
import { Switch } from '@cloudflare/kumo/components/switch'
import { AskIcon, ChatIcon, CollapseIcon, ExpandIcon, ICON_SM } from '../../components/icons'
import { WidgetFrame } from '../../components/widget/WidgetFrame'
import { useT } from '../../i18n/index.ts'
import type { ReadingWidgetBlock, WidgetParam } from '../data/client.ts'
import type { ParamValue, ParamValues } from './widget-params.ts'

function ParamControl({ param, value, onChange }: { param: WidgetParam; value: ParamValue; onChange: (value: ParamValue) => void }) {
  if (param.type === 'range') return <label className="widget-param widget-param-range" data-param={param.name}>
    <span className="widget-param-label">{param.label}</span>
    <input type="range" min={param.min} max={param.max} step={param.step} value={Number(value)} onChange={event => onChange(Number(event.target.value))} />
    <output className="widget-param-value">{String(value)}{param.unit ?? ''}</output>
  </label>
  if (param.type === 'toggle') return <div className="widget-param" data-param={param.name}>
    <Switch size="sm" label={param.label} checked={value === true} onCheckedChange={onChange} />
  </div>
  return <div className="widget-param" data-param={param.name}>
    <span className="widget-param-label">{param.label}</span>
    <Select size="sm" aria-label={param.label} value={String(value)} items={Object.fromEntries(param.options.map(option => [option.value, option.label]))}
      onValueChange={next => { if (typeof next === 'string') onChange(next) }} />
  </div>
}

export function ReadingWidget({ block, expanded, slotHeight, values, failure, asked, onToggleExpand, onCollapse, onWidgetSend, onValue, onAsk, onFootprint, onRuntimeError, onFix }: {
  block: ReadingWidgetBlock
  expanded: boolean
  slotHeight: number
  /** The values the page sees, already fitted to the declaration; undefined for a widget without params */
  values: ParamValues | undefined
  /** The runtime error text when the page threw right after it started */
  failure: string | null
  asked: boolean
  onToggleExpand: (id: string, slot: HTMLElement | null) => void
  onCollapse: () => void
  onWidgetSend: (text: string) => void
  onValue: (name: string, value: ParamValue) => void
  onAsk: (stage: HTMLElement) => void
  onFootprint: (stage: HTMLElement) => void
  onRuntimeError: (message: string) => void
  onFix: () => void
}) {
  const S = useT().studio.reading
  const slot = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null)
  const name = block.title || S.widgetIdle
  return <div ref={slot} className="reading-widget-slot" style={expanded && slotHeight > 0 ? { minHeight: slotHeight } : undefined}>
    <div ref={stage} className={`reading-widget${expanded ? ' is-expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? name : undefined}>
      <div className="reading-widget-bar">
        <span className="reading-widget-name">{name}</span>
        <span className="reading-widget-actions">
          {asked && !expanded && <button type="button" className="icon-btn reading-widget-footprint" aria-label={S.widgetFootprint} title={S.widgetFootprint}
            onClick={() => onFootprint(stage.current!)}><ChatIcon size={ICON_SM} /></button>}
          {!expanded && <button type="button" className="icon-btn reading-widget-ask" aria-label={S.widgetAsk} title={S.widgetAsk} onClick={() => onAsk(stage.current!)}><AskIcon /></button>}
          <button type="button" className="icon-btn reading-widget-toggle" aria-label={expanded ? S.widgetCollapse : S.widgetExpand} title={expanded ? S.widgetCollapse : S.widgetExpand}
            onClick={() => onToggleExpand(block.id, slot.current)}>{expanded ? <CollapseIcon /> : <ExpandIcon />}</button>
        </span>
      </div>
      <WidgetFrame widgetCode={block.html} isStreaming={false} light fillHeight={expanded} params={values} onRuntimeError={onRuntimeError}
        onSendMessage={onWidgetSend} onEscape={expanded ? onCollapse : undefined} />
      {block.params?.length && values ? <div className="reading-widget-params" role="group" aria-label={S.widgetControls} data-theme="celadon">
        {block.params.map(param => <ParamControl key={param.name} param={param} value={values[param.name]!} onChange={value => onValue(param.name, value)} />)}
      </div> : null}
      {failure !== null && <div className="reading-widget-failed" role="status" title={failure}>
        <span>{S.widgetFailed}</span>
        <Button variant="secondary" size="sm" onClick={onFix}>{S.widgetFix}</Button>
      </div>}
    </div>
    {expanded && <div className="reading-widget-backdrop" aria-hidden onClick={() => onToggleExpand(block.id, slot.current)} />}
  </div>
}
