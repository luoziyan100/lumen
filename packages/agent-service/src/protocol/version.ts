/**
 * [INPUT]: 无
 * [OUTPUT]: PROTOCOL_VERSION / protocolVersionOf / isProtocolCurrent
 * [POS]: 协议握手的运行时常量;hello 与 portfile 同源引用;旧字段缺失视为 0
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 当前线协议代数。只检测+提示,不做多版本兼容。 */
export const PROTOCOL_VERSION = 1

/** 旧 daemon / 旧 portfile 无字段 → 0 */
export function protocolVersionOf(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0
  const v = (raw as { protocolVersion?: unknown }).protocolVersion
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function isProtocolCurrent(raw: unknown): boolean {
  return protocolVersionOf(raw) === PROTOCOL_VERSION
}
