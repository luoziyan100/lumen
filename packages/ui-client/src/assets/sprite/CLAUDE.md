# sprite/
> L2 | 父级: ../CLAUDE.md

- `neutral.webp`：256px 空闲脸，也是说话交替的休止帧。
- `blink.webp`：256px 闭眼脸，空闲节奏短暂显示。
- `thinking.webp`：256px 思考脸，工具与模型活动但没有文字增量时显示。
- `warm.webp`：256px 微笑脸，审批或追问等待用户时显示。
- `speaking.webp`：256px 说话脸，仅在可见文字流入时交替显示。
- `body-neutral.png`：全身中性母版，逐字节保留来源；不参与运行时加载。
- `runtime/`：全身母版的两档透明 WebP 派生，仅此子目录被共享全身显示层加载。
- `SOURCE.md`：定稿来源、参考图、模型与逐张生成时间，供核查素材未变。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
