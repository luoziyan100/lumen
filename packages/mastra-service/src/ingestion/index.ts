/**
 * [INPUT]: 摄取工具、DOCX 与图像解析模块
 * [OUTPUT]: 原生工具工厂和可独立调用的纯解析函数
 * [POS]: 应用组合入口；不暴露内部 ZIP 或文件权限实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export { createIngestionTools } from './tools.ts'
export type { IngestionWorkspaceResolver } from './tools.ts'
export { createImageToolResultProcessor } from './processor.ts'
export { extractDocxText } from './docx.ts'
export { imageInfo } from './images.ts'
export type { ImageInfo } from './images.ts'
