# A04 sprite art provenance

> Selected source: `2026-11-12-lumen-sprite-chibi/out/final/manifest.json` in agent-hub.

A04 is the selected sitting chibi, without a capsule. The neutral was generated on 2026-11-13 at 01:58:02-07:00; expression edits were generated on the same date (individual timestamps below). Model: `gpt-image-2.6-flare`, through the configured KIE image editing service. No images were generated for this integration.

The 20 delivered images are copied byte for byte. Full prompts, reference inputs and usage are retained in the source manifest. Only eyes/mouth patched onto A04; alpha identical across the five 1024px PNG masters. Shared alpha cleanup clears values at or below 1/255 after LANCZOS resampling; original provider files remain untouched.

## Fixed geometry

- Original A04 canvas: 1254 × 1254. Head crop: `[338, 136, 915, 713]`.
- Master canvas: 1024 × 1024. Head crop: `[276, 111, 747, 582]`.
- Body crop: `[199, 24, 826, 1000]` (627 × 976, right/bottom exclusive).
- Allowed face rectangle in master coordinates: `[327, 257, 710, 506]` (inclusive).
- Runtime body: 118 × 184 at @2x, 177 × 276 at @3x. Head: 256 × 256.
- @2x body is lossless; @3x body and head use WebP quality 94. Masters are archival and never imported.
- Desktop has a separate 288 x 452 source set for its 156 x 238 host (144 x 226 CSS-pixel image area). It matches 288 x 452 device pixels at DPR2 exactly, avoiding an extra horizontal resampling pass. Compact still uses the unchanged delivered @2x/@3x files.

## Desktop derivation (R1, 2026-11-13)

The hidden form previously enlarged the compact 184px @2x image. These additional derivatives correct that source mismatch without changing compact art or enabling the desktop feature. The neutral derivative retains the complete body; the other four keep only the fixed face rectangle on the **same 288 x 452 canvas**. The renderer already stacks these expressions over the persistent neutral silhouette and clips that same face rectangle. Clearing unused overlay pixels avoids storing the body five times while preserving the rendered silhouette/alpha outside the face.

Reproduce from the repository root with Pillow 11.3.0 and cwebp 1.6.0. Crop is [199,24,826,1000]; LANCZOS output is 288 x 452; the mapped face box is [58,107,236,224] (right/bottom exclusive). Shared alpha cleanup maps values <=1 to 0. WebP color quality 50, method 6, alpha quality 100, exact transparent RGB, no metadata. Desktop imports explicitly disable Vite inlining so all five remain separate WebP assets without base64 overhead. The overlays use a four-encoded-pixel alpha ramp strictly inward from the face rectangle, avoiding a hard edge between independent lossy encodes without changing the permitted face region. Quality 50 totals 449,614 bytes and was visually checked against the enlarged compact source. The desktop neutral is visibly sharper. The five desktop files add 36,000 bytes; all 20 runtime WebP files total 449,614 bytes. The 20 delivered originals remain unchanged.

```sh
python3 - <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw, ImageChops
import hashlib, subprocess
root = Path('packages/ui-client/src/assets/sprite')
faces = ['neutral', 'blink', 'thinking', 'warm', 'speaking']
rows = []
with TemporaryDirectory(prefix='lumen-chibi-encode-') as temporary:
    for face in faces:
        master = root / f'body-{face}.png'
        image = Image.open(master).convert('RGBA').crop((199, 24, 826, 1000))
        image = image.resize((288, 452), Image.Resampling.LANCZOS)
        image.putalpha(image.getchannel('A').point(lambda value: 0 if value <= 1 else value))
        if face != 'neutral':
            patch = image.crop((58, 107, 236, 224))
            mask = Image.new('L', patch.size)
            draw = ImageDraw.Draw(mask)
            for inset in range(5):
                draw.rectangle((inset, inset, 177-inset, 116-inset), fill=round(255*inset/4))
            patch.putalpha(ImageChops.multiply(patch.getchannel('A'), mask))
            overlay = Image.new('RGBA', image.size)
            overlay.paste(patch, (58, 107))
            image = overlay
        png = Path(temporary) / f'{face}.png'
        image.save(png)
        output = root / f'body-desktop-{face}@2x.webp'
        subprocess.run(['cwebp', '-quiet', '-q', '50', '-m', '6', '-alpha_q', '100', '-exact', '-metadata', 'none', str(png), '-o', str(output)], check=True)
        rows.append({'file': output.name, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'source': master.name, 'sourceSHA256': hashlib.sha256(master.read_bytes()).hexdigest(), 'size': list(image.size)})
PY
```

| Desktop file | Bytes | SHA256 |
|---|---:|---|
| body-desktop-neutral@2x.webp | 25562 | ae0515864064855a20eae4d2ea44b077c672a8750c4ea3a16e574a62f0c944d8 |
| body-desktop-blink@2x.webp | 2370 | a38c4221f2da3636a1f45679b0cb6b9499d7792d62abff0be3275e8d416b8cd9 |
| body-desktop-thinking@2x.webp | 2612 | a7e7b9e35fddc2691b614de99bb7afadf97ba7ad72d278750d64423b018032f0 |
| body-desktop-warm@2x.webp | 2744 | 5bf5caee9ea34c1aec9b1ec73b11ced2b1f28652da0d8823c7a16a8b75170b3f |
| body-desktop-speaking@2x.webp | 2712 | 1c516ada8449a4b2c3c7771bacb32c94e957dc2a2c596180d0472571e8bde7ab |

## Rendering invariant

The neutral silhouette remains visible. Other expression layers are clipped to the fixed face rectangle and change opacity only. This prevents independent lossy WebP encodes and transparent-edge compositing from changing hair, clothing or the silhouette during a cross-fade. Avatar circular clipping remains in CSS. Motion belongs to the shared body wrapper. Shadow is applied only to the persistent neutral image; stable compositing prevents transparent-edge rounding from changing when facial layers appear.

## SHA256 and generation timestamps

| File | Bytes | Generated at | SHA256 |
|---|---:|---|---|
| body-neutral.png | 963430 | 2026-11-13T01:58:02.467349-07:00 | c1c99621f5614db4a111d85e88ea641db68b86fc3960cf108d6e4bab5180d10c |
| body-neutral@2x.webp | 32110 | 2026-11-13T01:58:02.467349-07:00 | f6326e0fa02413f918140f15c80feb8dc523f1cc26cdd9f1b4b5406fee5394df |
| body-neutral@3x.webp | 25658 | 2026-11-13T01:58:02.467349-07:00 | 16c859dad11f798c6452b3ffe3de91ae969f9225356039129c29b9a245c10461 |
| head-neutral.webp | 25408 | 2026-11-13T01:58:02.467349-07:00 | 1b12f0815435675fe42464355f024c4d5ab8a79a2b85a63099a78ee5d2fb6625 |
| body-blink.png | 953677 | 2026-11-13T02:14:58.669623-07:00 | ef16f26a1d51508b85b87b3eabbdf764c768e52db05b0b306a8bae0fddc81e25 |
| body-blink@2x.webp | 31760 | 2026-11-13T02:14:58.669623-07:00 | eaab5b9f10fbb916c5461ad363b6b51cec0979fb6fd57c0e40a7cb3bd5ab7b9f |
| body-blink@3x.webp | 25254 | 2026-11-13T02:14:58.669623-07:00 | 4917a58e09c594201c01fc28941af94b6dd6017e42a6b272a8b93e829af5001d |
| head-blink.webp | 24430 | 2026-11-13T02:14:58.669623-07:00 | 5d659d3fdd51ab10470092a2d22930824a339e81ac620720f410bcc2ccbe8a8d |
| body-thinking.png | 960254 | 2026-11-13T02:15:47.932210-07:00 | 06b7b0a66d8e557e8def32f3f2fee26c4e124882648e3cf0687ebfe935a476c2 |
| body-thinking@2x.webp | 31938 | 2026-11-13T02:15:47.932210-07:00 | 407b0f3790c357ba0a489983fdc15dbc816f81d1c3204c135caf689799b53961 |
| body-thinking@3x.webp | 25516 | 2026-11-13T02:15:47.932210-07:00 | 3e8a8cabca17f4e4447c6bb8b5f40eca9b90720064b58cc747c69fbee21e2d62 |
| head-thinking.webp | 25180 | 2026-11-13T02:15:47.932210-07:00 | fdbf5561cd1c640e80b6aec35345ce4eeb4ceca9b86bfa7974874f0b14ee1005 |
| body-speaking.png | 964454 | 2026-11-13T02:16:23.875232-07:00 | 33ef93e36a6fe0fee9c2b5aefb89ea18a0374c650c3e42fa95d07aa649badb1d |
| body-speaking@2x.webp | 32114 | 2026-11-13T02:16:23.875232-07:00 | 22c51da486605bc4f42c50df0c43b981d0250b71b9148d691b0ab52665967573 |
| body-speaking@3x.webp | 25654 | 2026-11-13T02:16:23.875232-07:00 | 44da35a04fa4a65c73892083921ae2ba386265343fb3d9b2b370e9ab1fc348cf |
| head-speaking.webp | 25498 | 2026-11-13T02:16:23.875232-07:00 | 7152c022f6e72e904134650783fb127f241b03063b53a0a7e239f3a99c36fe1e |
| body-warm.png | 962318 | 2026-11-13T02:16:59.991640-07:00 | 598a501162123d495524a15c845428e3c450448274b5eb121613f7af4c48afb3 |
| body-warm@2x.webp | 32038 | 2026-11-13T02:16:59.991640-07:00 | 68ee8db51399d588c28d6ad01dbcc61c5c93e9309bde2b4a0880699a832978a6 |
| body-warm@3x.webp | 25678 | 2026-11-13T02:16:59.991640-07:00 | 5aadc72c8aa5464b8d8e0b4f76e7a9771126458bee7a12d3cbc938bea3fa0aad |
| head-warm.webp | 25378 | 2026-11-13T02:16:59.991640-07:00 | 4404f29bb8b731c906aeadee99000ba29047a067ec50de70bc9d0fe6ba404d9d |

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
