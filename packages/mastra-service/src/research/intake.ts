/**
 * [INPUT]: 原生工具执行上下文
 * [OUTPUT]: LibraryIntake：研究工具把抓到的原件收进资料库并引用到当前主题的回调类型
 * [POS]: research 与 studio 之间的窄接口；研究工具不知道主题与数据库，主题由应用从受信身份推出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ToolExecutionContext } from '@mastra/core/tools'

export interface IntakeInput { name: string; bytes: Uint8Array; sourceUrl: string; kind: 'pdf' | 'web'; title?: string; mediaType?: string }
export type LibraryIntake = (context: ToolExecutionContext | undefined, input: IntakeInput) => Promise<{ itemId: string; title: string; created: boolean }>
