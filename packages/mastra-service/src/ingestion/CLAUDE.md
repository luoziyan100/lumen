# ingestion/
> L2 | 父级: ../CLAUDE.md

本地文档与图片经过应用注入的可信 Workspace 读取。DOCX 解析不执行文档内容；图片经内容指纹校验后交给当前模型的原生多模态输入，不建立另一套模型客户端或图片侧车。

- `files.ts`：工作区相对路径、文件体积与取消边界；读取/保存均遵守原生文件系统权限；保存只创建新文件。
- `zip.ts`：OOXML 所需的 ZIP 中央目录读取、CRC 和有实际输出上限的可取消解压，不释放文件到宿主目录。
- `docx.ts`：命名空间感知的正文抽取；保留段落、制表/换行，排除删除修订，拒绝 DTD 和无界正文。
- `images.ts`：以真实文件头确认 PNG/JPEG/GIF/WebP、尺寸及像素上限；不按扩展名臆测格式；SHA256 引用绑定读取时的真实内容。
- `tools.ts`：原生 extract_docx/look_at_image；DOCX 返回正文，图像返回路径/指纹/尺寸，持久结果与事件不携带 base64。
- `processor.ts`：用官方 processLLMRequest 在可信 Workspace 校验引用并加载原生 user-file 输入；文件变动/删除显式要求重读，不改持久消息。
- `index.ts`：工具组合与纯摄取函数的公开入口。

边界：DOCX 读取主文档正文，不承诺还原版式或提取嵌入图像/独立脚注；图片不提供 OCR 替代模型，当前模型必须支持视觉。

组合要求：Agent 同时注册 createIngestionTools 和 inputProcessors 中的 createImageToolResultProcessor；两者共用可信 Workspace resolver，确保当前 SDK 向模型发送真实图像。

决策：图像字节只进入当次 provider 请求。当前 AgentController 会透传 modelOutput 元数据，故不把 base64 放进原始结果或 toModelOutput，避免展示变换无法覆盖的旁路。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
