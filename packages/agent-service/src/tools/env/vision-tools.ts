/**
 * [INPUT]: ImageStore;OpenAI transport;硅基 VL chat/completions
 * [OUTPUT]: createLookAtImageTool / withImageSanitize / shouldStripImagesForModel / visionEnv
 * [POS]: 识图工具 look_at_image;DeepSeek 路径强制去图桩后再 chat
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ModelPort, ModelResponse } from '../../core/model-port.ts'
import type { Message, ToolSpec } from '../../core/types.ts'
import type { Tool, ToolResult } from '../../core/tool.ts'
import {
  createOpenAIFetchTransport,
  type OpenAIRequest,
  type OpenAIResponseBody,
  type OpenAITransport,
} from '../../adapters/openai.ts'
import { ImageStore, stripImagesForModel } from './image-store.ts'

export interface VisionEnv {
  apiKey?: string
  baseUrl: string
  model: string
}

/**
 * createOpenAIFetchTransport 会再拼 `/v1/chat/completions`。
 * 若 .env 写成 https://api.siliconflow.cn/v1 → 变成 /v1/v1/... → 硅基 404。
 */
export function normalizeVisionBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '').replace(/\/v1$/i, '')
}

export function visionEnvFromProcess(env: NodeJS.ProcessEnv = process.env): VisionEnv {
  return {
    apiKey: env.LUMEN_VISION_API_KEY?.trim() || undefined,
    baseUrl: normalizeVisionBaseUrl(env.LUMEN_VISION_BASE_URL?.trim() || 'https://api.siliconflow.cn'),
    model: env.LUMEN_VISION_MODEL?.trim() || 'Qwen/Qwen3-VL-32B-Instruct',
  }
}

/** DeepSeek 等不吃 image_url 时必须 strip;Claude 原生多模态跳过 */
export function shouldStripImagesForModel(modelName: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LUMEN_VISION_FORCE === '1') return true
  if (env.LUMEN_VISION_FORCE === '0') return false
  return /deepseek/i.test(modelName)
}

export function withImageSanitize(
  model: ModelPort,
  store: ImageStore,
  taskId: string,
): ModelPort {
  return {
    async chat(messages: Message[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelResponse> {
      const cleaned = stripImagesForModel(messages, store, taskId)
      return model.chat(cleaned, tools, signal)
    },
  }
}

const VISION_SYSTEM = `你是识图助手。根据图片类型选择侧重点输出中文描述,供主模型阅读(它看不到像素):
1. 纯文字/文档截图 → OCR:尽量忠实还原可见文字与结构(标题/列表/段落)
2. UI/表格/页面布局 → 讲清区块层级、组件、相对位置、可见文案与交互线索
3. 图形/插画/动画感画面 → 讲清主体、动作/姿态、光影、材质、构图与氛围,不要只列物体名
先用一行标明判定类型(OCR / 布局 / 图形),再写正文。不要寒暄。`

function focusHint(focus?: string): string {
  const f = focus?.trim()
  if (!f) return '请完整识图。'
  const low = f.toLowerCase()
  if (low === 'ocr') return '侧重 OCR,尽量还原全部可见文字。'
  if (low === 'layout' || low === 'ui') return '侧重界面/表格布局与层级。'
  if (low === 'graphics' || low === 'art') return '侧重图形、动作、光影与构图。'
  return `用户额外要求:${f}`
}

export function createLookAtImageTool(options: {
  store: ImageStore
  env: VisionEnv
  transport?: OpenAITransport
}): Tool {
  const transport = options.transport ?? (
    options.env.apiKey
      ? createOpenAIFetchTransport({ apiKey: options.env.apiKey, baseUrl: options.env.baseUrl })
      : null
  )

  return {
    spec: {
      name: 'look_at_image',
      description:
        '识图:查看用户附带的图片(占位符 [[image:img-N]])。你看不到像素,涉及图片内容时必须先调用本工具。' +
        'image_id 形如 img-1;可选 focus=ocr|layout|graphics 或自由提示。',
      parameters: {
        type: 'object',
        properties: {
          image_id: { type: 'string', description: '图片序列名,如 img-1' },
          focus: {
            type: 'string',
            description: '可选:ocr / layout / graphics,或一句自由聚焦提示',
          },
        },
        required: ['image_id'],
      },
    },
    run: async (args, ctx, signal): Promise<ToolResult> => {
      const imageId = String(args.image_id ?? '').trim()
      if (!/^img-\d+$/.test(imageId)) {
        return { llmContent: `error: image_id 无效「${imageId}」,应为 img-1 这种形式` }
      }
      const img = options.store.get(ctx.taskId, imageId)
      if (!img) {
        return { llmContent: `error: 找不到图片 ${imageId}(可能已过期或不属于本会话)` }
      }
      if (!options.env.apiKey || !transport) {
        return {
          llmContent:
            'error: 未配置识图服务。请在 agent-service 环境变量设置 LUMEN_VISION_API_KEY' +
            '（硅基流动等 VL 模型,如 Qwen/Qwen3-VL-32B-Instruct）,然后重启服务。',
        }
      }

      const focus = typeof args.focus === 'string' ? args.focus : undefined
      const request: OpenAIRequest = {
        model: options.env.model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: VISION_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
              { type: 'text', text: focusHint(focus) },
            ],
          },
        ],
      }

      try {
        const body = (await transport(request, signal)) as OpenAIResponseBody
        const text = (body.choices?.[0]?.message?.content ?? '').trim()
        if (!text) return { llmContent: `error: 识图模型返回空正文(${options.env.model})` }
        return {
          llmContent: `[${imageId} 识图结果]\n${text}`,
          data: { imageId, model: options.env.model },
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { llmContent: `error: 识图失败 — ${msg}` }
      }
    },
  }
}
