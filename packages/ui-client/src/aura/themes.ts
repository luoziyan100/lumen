import type { AuraMap, AuraParams, AuraState } from './states'
import { AURA_STATES, DEFAULT_AURA_MAP } from './states'

export interface AuraTheme {
  key: string
  label: string
  /** 明暗基调：决定试验台文案/角标用墨字还是白字 */
  appearance: 'dark' | 'light'
  map: AuraMap
}

/**
 * 主题 = 换色不换动。
 * 动效参数（speed/distortion/swirl/ease）是状态的语义，所有主题共享基线；
 * 主题只覆盖颜色字段，决定 Lumen 的"气质"。
 */
function recolor(patch: Record<AuraState, Partial<AuraParams>>): AuraMap {
  const out = structuredClone(DEFAULT_AURA_MAP)
  for (const s of AURA_STATES) Object.assign(out[s], patch[s])
  return out
}

/** 极光：青绿冷冽，理性透明 */
const auroraMap = recolor({
  idle: {
    colors: ['#04101a', '#0a3d3f', '#10614e', '#123a6b'],
    neuroColor: '#5affc8',
    borderColors: ['#3ff0c8', '#37c8f0'],
  },
  listening: {
    colors: ['#051426', '#0d5a6b', '#18a08f', '#1a4a8f'],
    neuroColor: '#5affc8',
    borderColors: ['#3ff0c8', '#37c8f0'],
  },
  thinking: {
    colors: ['#08102a', '#14506b', '#2a7a5a', '#3a3a8f'],
    neuroColor: '#7ae8c8',
    borderColors: ['#5ce0b8', '#37c8f0'],
  },
  researching: {
    colors: ['#0a1420', '#1a8f6b', '#e0c53a', '#14506b'],
    neuroColor: '#8affe0',
    borderColors: ['#8affe0', '#e0c53a'],
  },
  writing: {
    colors: ['#0c1620', '#3a8f7a', '#d8f0e0', '#1f4a6b'],
    neuroColor: '#c8ffe8',
    borderColors: ['#d8f0e0', '#5ce0b8'],
  },
  blocked: {
    colors: ['#1a060d', '#5c0f2a', '#8f1f3a', '#2a0a14'],
    neuroColor: '#ff8a5c',
    borderColors: ['#ff3a5c', '#ff7a4a'],
  },
  done: {
    colors: ['#0d2a1f', '#5ce0b8', '#eafff5', '#2a8f6b'],
    neuroColor: '#c8ffe8',
    borderColors: ['#8affe0', '#5ce0b8'],
  },
})

/** 墨金：烛火纸墨，古典书房 */
const inkGoldMap = recolor({
  idle: {
    colors: ['#14100a', '#3a2f1a', '#6b5a33', '#241a0d'],
    neuroColor: '#ffd98a',
    borderColors: ['#ffd98a', '#e0a53a'],
  },
  listening: {
    colors: ['#1a140c', '#4a3a1f', '#8f6b2a', '#33240f'],
    neuroColor: '#ffd98a',
    borderColors: ['#ffd98a', '#e0a53a'],
  },
  thinking: {
    colors: ['#180f08', '#4a2a14', '#7a4a1f', '#2a140a'],
    neuroColor: '#ffb35c',
    borderColors: ['#ffb35c', '#e0a53a'],
  },
  researching: {
    colors: ['#1f120a', '#8f4a1a', '#e0912f', '#3a2410'],
    neuroColor: '#ffdf8a',
    borderColors: ['#ffdf8a', '#e0912f'],
  },
  writing: {
    colors: ['#1f180d', '#c9a04a', '#f0e4c0', '#4a3a1f'],
    neuroColor: '#ffe8b8',
    borderColors: ['#f0e4c0', '#c9a04a'],
  },
  blocked: {
    colors: ['#170608', '#4d0f14', '#7a1f1f', '#26060a'],
    neuroColor: '#ff8a5c',
    borderColors: ['#ff4444', '#ff8a5c'],
  },
  done: {
    colors: ['#2a1f0d', '#e8b45c', '#fff2d8', '#8f5b2a'],
    neuroColor: '#ffe8b8',
    borderColors: ['#ffd98a', '#ffb35c'],
  },
})

/** 月光：去饱和灰蓝，极简克制 */
const moonlightMap = recolor({
  idle: {
    colors: ['#0a0c12', '#1f2433', '#3a4356', '#141824'],
    neuroColor: '#8fa0c0',
    borderColors: ['#8fa0c0', '#5a6b8f'],
  },
  listening: {
    colors: ['#0c0f16', '#2a3040', '#5a6880', '#1a2030'],
    neuroColor: '#b0c0e0',
    borderColors: ['#b0c0e0', '#6b7a9f'],
  },
  thinking: {
    colors: ['#0c0e18', '#242a44', '#4a5578', '#181d33'],
    neuroColor: '#a0b0d8',
    borderColors: ['#8fa0c0', '#5a6b8f'],
  },
  researching: {
    colors: ['#10131f', '#3a4568', '#8f9ec0', '#20263f'],
    neuroColor: '#c0d0f0',
    borderColors: ['#c0d0f0', '#8f9ec0'],
  },
  writing: {
    colors: ['#12121a', '#4a4a5a', '#c0bccc', '#242433'],
    neuroColor: '#d8d8e8',
    borderColors: ['#c0bccc', '#8f8fa0'],
  },
  blocked: {
    colors: ['#140a0c', '#3f1a20', '#6b2a33', '#1f0d12'],
    neuroColor: '#e08a8a',
    borderColors: ['#e05a5a', '#c04a5c'],
  },
  done: {
    colors: ['#1a1a20', '#8f8fa0', '#e8e8f0', '#44445c'],
    neuroColor: '#e8e8f0',
    borderColors: ['#d8d8e8', '#b0b0c0'],
  },
})

/**
 * 水墨：宣纸留白为底，墨分五色（焦浓重淡清）做层次；
 * 彩色只有两处——blocked 朱砂（警示），done 石绿（完成）。
 * 认知层走 multiply——墨渗进纸，而不是光浮出暗。
 */
const inkWashMap = recolor({
  idle: {
    // 留白为主，淡墨轻晕
    colors: ['#f0ebdd', '#c9c5b8', '#9a978f', '#e6dfd0'],
    neuroColor: '#4a4a52',
    neuroBlend: 'multiply',
    borderColors: ['#7a8494', '#9aa4b0'],
  },
  listening: {
    // 墨色微聚，黛色边缘轻呼吸
    colors: ['#eee8d9', '#b0ada2', '#6b6a66', '#e0d8c6'],
    neuroColor: '#4a4a52',
    neuroBlend: 'multiply',
    borderColors: ['#7a8494', '#9aa4b0'],
  },
  thinking: {
    // 墨聚成形，向内盘旋
    colors: ['#e8e2d2', '#8a8880', '#3a3a40', '#c9c4b4'],
    neuroColor: '#3a3a42',
    neuroBlend: 'multiply',
    borderColors: ['#55545c', '#7a8494'],
  },
  researching: {
    // 泼墨，浓墨大开大合
    colors: ['#e6dfcc', '#55545c', '#26262c', '#a8a496'],
    neuroColor: '#2a2a30',
    neuroBlend: 'multiply',
    borderColors: ['#3a3a42', '#8a8880'],
  },
  writing: {
    // 行笔，墨韵匀停
    colors: ['#efe9da', '#b8b4a6', '#4a4a50', '#ddd5c2'],
    neuroColor: '#55545c',
    neuroBlend: 'multiply',
    borderColors: ['#8a8880', '#b0ada2'],
  },
  blocked: {
    // 朱砂入墨，纸色沉下来
    colors: ['#e2d6c0', '#7a2a20', '#33201c', '#c4b096'],
    neuroColor: '#7a2a20',
    neuroBlend: 'multiply',
    borderColors: ['#c03a2a', '#e05a3a'],
  },
  done: {
    // 墨定纸清，石绿一点（四绿，淡阶）
    colors: ['#f2ecdc', '#ddd2b8', '#a8d0b2', '#e8e0c9'],
    neuroColor: '#7fae90',
    neuroBlend: 'multiply',
    borderColors: ['#c4dfcb', '#a8d0b2'],
  },
})

/**
 * 青瓷：白瓷为底，釉下透出非常淡的青绿，接近"月白泛青"。
 * 全主题最轻的一套；blocked 用赭红陶色，不破坏瓷感。
 */
const celadonMap = recolor({
  idle: {
    // 白瓷素面，釉光微青
    colors: ['#f8f7f1', '#e8efe6', '#d2e2d4', '#f0f2ea'],
    neuroColor: '#9cc2a8',
    neuroBlend: 'multiply',
    borderColors: ['#cfe4d4', '#b8d8c0'],
  },
  listening: {
    colors: ['#f4f5ec', '#dce9dc', '#b8d4bd', '#eaf0e4'],
    neuroColor: '#8fb89c',
    neuroBlend: 'multiply',
    borderColors: ['#b8d8c0', '#cfe4d4'],
  },
  thinking: {
    // 釉色聚拢
    colors: ['#f0f2e8', '#cfe0d0', '#96bfa2', '#dfe9dc'],
    neuroColor: '#8fb89c',
    neuroBlend: 'multiply',
    borderColors: ['#a8ccb0', '#cfe4d4'],
  },
  researching: {
    // 青色最浓的一刻（依然是淡的）
    colors: ['#eef0e4', '#b0d0b8', '#7fae90', '#d5e5d5'],
    neuroColor: '#6fa080',
    neuroBlend: 'multiply',
    borderColors: ['#8fb89c', '#b8d8c0'],
  },
  writing: {
    colors: ['#f6f4ea', '#dde8da', '#a8ccb0', '#ecefe2'],
    neuroColor: '#9cc2a8',
    neuroBlend: 'multiply',
    borderColors: ['#b8d8c0', '#dde8da'],
  },
  blocked: {
    // 赭红陶色，瓷器的"火警"
    colors: ['#f0e6dc', '#d89080', '#b05a48', '#e8dcd0'],
    neuroColor: '#a05a48',
    neuroBlend: 'multiply',
    borderColors: ['#d06a55', '#e0917c'],
  },
  done: {
    colors: ['#f9f8f2', '#eaf0e2', '#b4d6bc', '#f2f3ea'],
    neuroColor: '#9cc2a8',
    neuroBlend: 'multiply',
    borderColors: ['#cce4d2', '#b4d6bc'],
  },
})

/**
 * 黑白：纯灰阶，零彩色。
 * 注意：blocked 放弃了红色警告（"完全黑白"优先），
 * 改用白色高强度脉冲传达警觉——靠亮度与节奏，不靠色相。
 */
const monoMap = recolor({
  idle: {
    colors: ['#050505', '#1a1a1a', '#3a3a3a', '#101010'],
    neuroColor: '#9a9a9a',
    borderColors: ['#8a8a8a', '#c0c0c0'],
  },
  listening: {
    colors: ['#070707', '#242424', '#5a5a5a', '#161616'],
    neuroColor: '#b0b0b0',
    borderColors: ['#e8e8e8', '#a0a0a0'],
  },
  thinking: {
    colors: ['#060606', '#202020', '#4d4d4d', '#141414'],
    neuroColor: '#c8c8c8',
    borderColors: ['#c0c0c0', '#8a8a8a'],
  },
  researching: {
    // 对比度最高的一刻
    colors: ['#080808', '#3a3a3a', '#e8e8e8', '#1f1f1f'],
    neuroColor: '#ffffff',
    borderColors: ['#ffffff', '#c0c0c0'],
  },
  writing: {
    colors: ['#0a0a0a', '#4a4a4a', '#d0d0d0', '#242424'],
    neuroColor: '#e0e0e0',
    borderColors: ['#e0e0e0', '#a0a0a0'],
  },
  blocked: {
    // 白色警报：不用红，用亮度和脉冲
    colors: ['#020202', '#2e2e2e', '#f0f0f0', '#0a0a0a'],
    neuroColor: '#ffffff',
    borderColors: ['#ffffff', '#d0d0d0'],
  },
  done: {
    colors: ['#141414', '#8a8a8a', '#f5f5f5', '#3a3a3a'],
    neuroColor: '#ffffff',
    borderColors: ['#ffffff', '#e0e0e0'],
  },
})

export const AURA_THEMES: AuraTheme[] = [
  { key: 'violet', label: '深空紫', appearance: 'dark', map: DEFAULT_AURA_MAP },
  { key: 'aurora', label: '极光', appearance: 'dark', map: auroraMap },
  { key: 'ink-gold', label: '墨金', appearance: 'dark', map: inkGoldMap },
  { key: 'moonlight', label: '月光', appearance: 'dark', map: moonlightMap },
  { key: 'ink-wash', label: '水墨', appearance: 'light', map: inkWashMap },
  { key: 'celadon', label: '青瓷', appearance: 'light', map: celadonMap },
  { key: 'mono', label: '黑白', appearance: 'dark', map: monoMap },
]
