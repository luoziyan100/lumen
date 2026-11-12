# 精灵头像来源

> L3 | 素材说明，不参与构建 · 变更时同步 `../CLAUDE.md` 与 `mastra/studio/CLAUDE.md`

- 来源任务：`/Users/zihao/Workspace/agent-hub/tasks/2026-11-12-lumen-sprite-art/`（契约 `2026-11-12-lumen-sprite-art`）
- 形象：外星 AI 少女，蓝紫渐变发；负责人选定第一轮 `v2-01` 作主形象
- 生成方式：`/v1/images/edits` 图生图，参考图 `out/round1/v2-01.png`，模型 `gpt-image-2.6-flare`
- 生成日期：2026-11-12；neutral 为 10:17:14-07:00，其余各表情为 10:17:00-08:00（逐张原样记录于 manifest）
- 表情：`neutral` `blink` `thinking` `warm` `speaking`，各 1 张
- 后处理：按双眼位置对齐、裁成 256px 圆形（脸占圆 70%），导出 WebP
- 逐张来源（提示词全文、尺寸、用量）：来源任务 `out/final/manifest.json`
- 入库文件即来源任务的 `out/final/*.webp`，未再裁切、未调色；大于 256px 的 PNG 不入库
- seed：平台不支持，无可记录值

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
