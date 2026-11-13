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

## 全身精灵

原型提交 `263305d` 的全身中性母版逐字节复制，仅改名。未生成新图，原有五表情文件保持原样。

母版 1792×1792，alpha 包围盒 `(318,18,1473,1774)`，各边增加 12 原图像素，裁切 `(306,6,1485,1786)`。Pillow `Image.Resampling.LANCZOS` 分别缩到 120×184 和 312×476，再执行 `cwebp -quiet -q 82 input.png -o output.webp`，保留透明通道。运行时两张 WebP 合计小于 30KB，母版不被 import。

| 文件 | SHA256 |
|---|---|
| body-neutral.png | 0a8c7f27ff8212a36d1c04029c68078f688ca2ed5cb23650962ddddf4fccc463 |
| runtime/body-compact@2x.webp | daeff2732added4233e186723aabce7682656977a780d0060891d836de9c5b8e |
| runtime/body-desktop@2x.webp | 657b05ed39c93b33456c0ff38cdf2343b1ccb8625fe0a13f17b22354bb886be5 |

在仓库根执行以下命令复现派生，需要 Pillow 与 `cwebp`：

```sh
python3 - <<'PY'
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from PIL import Image

root = Path('packages/ui-client/src/assets/sprite')
body = Image.open(root / 'body-neutral.png').crop((306, 6, 1485, 1786))
with TemporaryDirectory() as temporary:
    for name, size in [('compact', (120, 184)), ('desktop', (312, 476))]:
        source = Path(temporary) / (name + '.png')
        body.resize(size, Image.Resampling.LANCZOS).save(source)
        run(['cwebp', '-quiet', '-q', '82', str(source), '-o',
             str(root / 'runtime' / ('body-' + name + '@2x.webp'))], check=True)
PY
```
