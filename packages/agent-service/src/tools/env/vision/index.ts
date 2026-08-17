/**
 * [INPUT]: vision-tools.ts / image-store.ts
 * [OUTPUT]: look_at_image 工厂、ImageStore、去图桩
 * [POS]: env/vision 单元出口。识图工具与图片侧车一起生死。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export {
  createLookAtImageTool,
  withImageSanitize,
  shouldStripImagesForModel,
  visionEnvFromProcess,
  normalizeVisionBaseUrl,
} from './vision-tools.ts'
export { ImageStore, stripImagesForModel, formatImagePlaceholder, IMAGE_ID_RE } from './image-store.ts'
