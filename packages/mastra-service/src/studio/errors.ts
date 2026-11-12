/**
 * [INPUT]: 无
 * [OUTPUT]: StudioError：带 HTTP 状态、可直接给人和模型读的中文错误
 * [POS]: studio 模块唯一错误类型；存储、HTTP 与白板工具共用，文案说明下一步怎么办
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export class StudioError extends Error {
  readonly status: 400 | 404 | 409 | 413

  constructor(message: string, status: 400 | 404 | 409 | 413) {
    super(message)
    this.name = 'StudioError'
    this.status = status
  }
}
