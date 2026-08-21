# env/vision/ — 识图

> L2 | 父级: `packages/agent-service/src/tools/env/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

`look_at_image` 与图片侧车一起生死。去图判定读档案 `vision` 声明(`resolveVision` 白名单 fail-closed),不再用 `/deepseek/i` 名字正则。

## 成员

- `vision-capability.ts` — `VisionMode` / `resolveVision` / `VISION_FAMILY_PATTERNS`;未声明 = 走桩
- `vision-tools.ts` — `createLookAtImageTool` / `withImageSanitize`;env:`LUMEN_VISION_*`;描述随 `visionActive` 两态
- `image-store.ts` — 任务级侧车 + `[[image:img-N]]` 桩
- `index.ts` — 单元出口

法则: 成员完整·一行一文件·父级链接
