/**
 * [INPUT]: 无
 * [OUTPUT]: withSourcesReminder —— 成功检索/抓取后回灌的一句,回指 persona,不立法
 * [POS]: research/ 共享地基。fetch_url 与 search_web 共用同一句,避免两处措辞漂移。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 成功检索后回灌线程的一句:回指 persona,不立法、不倒 URL */
export const SOURCES_LLM_REMINDER =
  'REMINDER: 答末 Sources 列作品，见系统提示 #检索之后；勿列本次抓取的每个文件路径。'

export function withSourcesReminder(content: string): string {
  return `${content}\n${SOURCES_LLM_REMINDER}`
}
