/**
 * 识图桥:去图桩 + look_at_image;主模型请求不得出现 image_url。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ImageStore,
  formatImagePlaceholder,
  stripImagesForModel,
} from '../../src/tools/env/image-store.ts'
import {
  createLookAtImageTool,
  normalizeVisionBaseUrl,
  shouldStripImagesForModel,
  withImageSanitize,
} from '../../src/tools/env/vision-tools.ts'
import { buildOpenAIRequest, isDeepSeekModel } from '../../src/adapters/openai.ts'
import type { Message } from '../../src/core/types.ts'
import type { ModelPort } from '../../src/core/model-port.ts'
import type { ToolContext } from '../../src/core/tool.ts'

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
const img = { mediaType: 'image/png', base64: PNG_B64 }

test('formatImagePlaceholder 含序列名与 look_at_image', () => {
  const s = formatImagePlaceholder('img-1')
  assert.match(s, /\[\[image:img-1\]\]/)
  assert.match(s, /look_at_image\(image_id="img-1"\)/)
})

test('stripImagesForModel 去 images 并插桩;同图哈希复用 id', () => {
  const store = new ImageStore()
  const messages: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: '这图是什么', images: [img, img] },
  ]
  const out = stripImagesForModel(messages, store, 'task-a')
  assert.equal(out[1]!.images, undefined)
  assert.match(out[1]!.content, /\[\[image:img-1\]\]/)
  // 同内容两张 → 同一 id,桩桩只出现一次缺失补全逻辑仍只 stash 复用
  assert.ok(store.get('task-a', 'img-1'))
  const out2 = stripImagesForModel(out, store, 'task-a')
  assert.equal(out2[1]!.content, out[1]!.content)
})

test('normalizeVisionBaseUrl 剥掉尾部 /v1 防双拼 404', () => {
  assert.equal(normalizeVisionBaseUrl('https://api.siliconflow.cn/v1'), 'https://api.siliconflow.cn')
  assert.equal(normalizeVisionBaseUrl('https://api.siliconflow.cn/v1/'), 'https://api.siliconflow.cn')
  assert.equal(normalizeVisionBaseUrl('https://api.siliconflow.cn'), 'https://api.siliconflow.cn')
})

test('shouldStripImagesForModel: deepseek 默认开,Claude 关', () => {
  assert.equal(shouldStripImagesForModel('deepseek-v4-flash', {}), true)
  assert.equal(shouldStripImagesForModel('claude-opus-4-8', {}), false)
  assert.equal(shouldStripImagesForModel('claude-opus-4-8', { LUMEN_VISION_FORCE: '1' }), true)
})

test('withImageSanitize:内层收到无 images 的消息;buildOpenAIRequest 无 image_url', async () => {
  let seen: Message[] = []
  const inner: ModelPort = {
    async chat(messages) {
      seen = messages
      return { message: { role: 'assistant', content: 'ok' }, toolCalls: [] }
    },
  }
  const store = new ImageStore()
  const wrapped = withImageSanitize(inner, store, 't1')
  await wrapped.chat(
    [{ role: 'user', content: '看图', images: [img] }],
    [],
  )
  assert.equal(seen[0]!.images, undefined)
  assert.match(seen[0]!.content, /\[\[image:img-1\]\]/)

  const req = buildOpenAIRequest(seen, [], 'deepseek-v4-flash', 1024)
  const blob = JSON.stringify(req)
  assert.equal(blob.includes('image_url'), false)
  assert.equal(blob.includes(PNG_B64), false)
})

test('look_at_image:scripted VL 回灌描述', async () => {
  const store = new ImageStore()
  store.stash('task-x', [img])
  const tool = createLookAtImageTool({
    store,
    env: { apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'Qwen/Qwen3-VL-32B-Instruct' },
    transport: async () => ({
      choices: [{ message: { content: '类型:布局\n侧栏有工作目录' } }],
    }),
  })
  const ctx = {
    taskId: 'task-x',
    agentRole: 'main',
    depth: 0,
    spawn: async () => ({ llmContent: '' }),
    emit: () => {},
    deps: {},
  } as ToolContext
  const r = await tool.run({ image_id: 'img-1' }, ctx)
  assert.match(r.llmContent, /img-1 识图结果/)
  assert.match(r.llmContent, /工作目录/)
})

test('buildOpenAIRequest:DeepSeek 带图也不产出 image_url(适配器最后防线)', () => {
  assert.equal(isDeepSeekModel('deepseek-v4-flash'), true)
  const req = buildOpenAIRequest(
    [{ role: 'user', content: '这是什么', images: [img] }],
    [],
    'deepseek-v4-flash',
    1024,
  )
  const blob = JSON.stringify(req)
  assert.equal(blob.includes('image_url'), false)
  assert.match(String(req.messages[0]!.content), /\[\[image:img-1\]\]/)
})

test('look_at_image:未配置 key 返回明确错误', async () => {
  const store = new ImageStore()
  store.stash('task-y', [img])
  const tool = createLookAtImageTool({
    store,
    env: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-VL-32B-Instruct' },
  })
  const ctx = {
    taskId: 'task-y',
    agentRole: 'main',
    depth: 0,
    spawn: async () => ({ llmContent: '' }),
    emit: () => {},
    deps: {},
  } as ToolContext
  const r = await tool.run({ image_id: 'img-1' }, ctx)
  assert.match(r.llmContent, /未配置识图/)
})
