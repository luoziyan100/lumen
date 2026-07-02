/**
 * Lumen 气场的核心契约：agent 状态 → 视觉参数。
 * 将来合并进 Lumen 客户端时，src/aura/ 整个目录原样搬走即可。
 */

export type AuraState =
  | 'idle' //        待机：深空夜色，缓慢呼吸
  | 'listening' //   聆听：醒来，青色边缘微光
  | 'thinking' //    思考：向内卷曲，神经纹理浮现
  | 'researching' // 检索：向外扫描，暖橙闯入，最活跃
  | 'writing' //     写作：流动顺滑，纸墨灯的暖色
  | 'blocked' //     受阻：凝滞暗红，边缘红色脉冲
  | 'done' //        完成：金白色绽放

export interface AuraParams {
  /** 基底层 MeshGradient */
  colors: [string, string, string, string]
  speed: number
  distortion: number
  swirl: number
  /** 认知层 NeuroNoise（opacity 0 = 隐藏） */
  neuroOpacity: number
  neuroSpeed: number
  neuroColor: string
  /** 认知层混合模式：screen=暗底发光（默认），multiply=浅底渗墨（水墨类主题用） */
  neuroBlend?: 'screen' | 'multiply'
  /** 警觉层 PulsingBorder（opacity 0 = 隐藏） */
  borderOpacity: number
  borderColors: [string, string]
  borderSpeed: number
  borderIntensity: number
  borderPulse: number
  /** 进入此状态的过渡速率（1/s，越大切得越快） */
  ease: number
}

export type AuraMap = Record<AuraState, AuraParams>

export const AURA_STATES: AuraState[] = [
  'idle',
  'listening',
  'thinking',
  'researching',
  'writing',
  'blocked',
  'done',
]

export const STATE_META: Record<AuraState, { label: string; caption: string }> = {
  idle: { label: '待机', caption: '我在。' },
  listening: { label: '聆听', caption: '在听。' },
  thinking: { label: '思考', caption: '让我想想……' },
  researching: { label: '检索', caption: '正在翻资料……' },
  writing: { label: '写作', caption: '在落笔了。' },
  blocked: { label: '受阻', caption: '卡住了，需要你看一眼。' },
  done: { label: '完成', caption: '好了。' },
}

export const DEFAULT_AURA_MAP: AuraMap = {
  idle: {
    colors: ['#0a0820', '#241d6e', '#0f4d5c', '#3b2b8a'],
    speed: 0.12,
    distortion: 0.55,
    swirl: 0.5,
    neuroOpacity: 0,
    neuroSpeed: 0.3,
    neuroColor: '#6bd7ff',
    borderOpacity: 0,
    borderColors: ['#37c8f0', '#7a5cff'],
    borderSpeed: 0.4,
    borderIntensity: 0.15,
    borderPulse: 0.1,
    ease: 2.5,
  },
  listening: {
    colors: ['#0b0d2a', '#2b2f8f', '#17818f', '#4636a8'],
    speed: 0.28,
    distortion: 0.35,
    swirl: 0.3,
    neuroOpacity: 0,
    neuroSpeed: 0.4,
    neuroColor: '#6bd7ff',
    borderOpacity: 0.35,
    borderColors: ['#37c8f0', '#7a5cff'],
    borderSpeed: 0.5,
    borderIntensity: 0.18,
    borderPulse: 0.2,
    ease: 3.5,
  },
  thinking: {
    colors: ['#0d0a24', '#3a1d7a', '#7a2a9a', '#1f2f6e'],
    speed: 0.45,
    distortion: 0.7,
    swirl: 0.95,
    neuroOpacity: 0.25,
    neuroSpeed: 0.5,
    neuroColor: '#9a6bff',
    borderOpacity: 0,
    borderColors: ['#7a5cff', '#b06bff'],
    borderSpeed: 0.5,
    borderIntensity: 0.15,
    borderPulse: 0.15,
    ease: 3,
  },
  researching: {
    colors: ['#160d24', '#5a2d9a', '#e07a2f', '#2a4fae'],
    speed: 0.85,
    distortion: 0.95,
    swirl: 0.55,
    neuroOpacity: 0.45,
    neuroSpeed: 1.1,
    neuroColor: '#66e0ff',
    borderOpacity: 0,
    borderColors: ['#66e0ff', '#e07a2f'],
    borderSpeed: 0.8,
    borderIntensity: 0.2,
    borderPulse: 0.25,
    ease: 3,
  },
  writing: {
    colors: ['#141028', '#c9a04a', '#e8dcc0', '#2a2f7a'],
    speed: 0.4,
    distortion: 0.3,
    swirl: 0.2,
    neuroOpacity: 0.12,
    neuroSpeed: 0.35,
    neuroColor: '#ffd9a0',
    borderOpacity: 0,
    borderColors: ['#ffd98a', '#c9a04a'],
    borderSpeed: 0.4,
    borderIntensity: 0.2,
    borderPulse: 0.15,
    ease: 2.5,
  },
  blocked: {
    colors: ['#170609', '#4d0f1f', '#7a1f2a', '#26060e'],
    speed: 0.18,
    distortion: 0.45,
    swirl: 0.35,
    neuroOpacity: 0,
    neuroSpeed: 0.3,
    neuroColor: '#ff8a5c',
    borderOpacity: 0.85,
    borderColors: ['#ff4444', '#ff8a5c'],
    borderSpeed: 1.1,
    borderIntensity: 0.5,
    borderPulse: 0.6,
    ease: 6,
  },
  done: {
    colors: ['#2a1f0d', '#e8b45c', '#fff2d8', '#8f5b2a'],
    speed: 0.35,
    distortion: 0.6,
    swirl: 0.3,
    neuroOpacity: 0,
    neuroSpeed: 0.3,
    neuroColor: '#ffd9a0',
    borderOpacity: 0.3,
    borderColors: ['#ffd98a', '#ffb35c'],
    borderSpeed: 0.4,
    borderIntensity: 0.25,
    borderPulse: 0.2,
    ease: 4,
  },
}
