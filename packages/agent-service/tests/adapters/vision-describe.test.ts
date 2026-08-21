/**
 * 识图桥:档案声明分流 + look_at_image 两态;文本档无 image_url,视觉档原生可见。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ImageStore,
  formatImagePlaceholder,
  stripImagesForModel,
} from '../../src/tools/env/vision/index.ts'
import {
  createLookAtImageTool,
  normalizeVisionBaseUrl,
  resolveVision,
  shouldStripImagesForModel,
  withImageSanitize,
} from '../../src/tools/env/vision/index.ts'
import {
  buildOpenAIRequest,
  createOpenAIAdapter,
  createOpenAIReplayTransport,
  isDeepSeekModel,
} from '../../src/adapters/openai.ts'
import type { Message } from '../../src/core/types.ts'
import type { ModelPort } from '../../src/core/model-port.ts'
import type { ToolContext } from '../../src/core/tool.ts'
import type { VisionMode } from '../../src/tools/env/vision/vision-capability.ts'

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

test('resolveVision 白名单:deepseek-vl 命中,deepseek-chat 不命中', () => {
  assert.equal(resolveVision({ vision: 'auto' }, 'deepseek-vl'), true)
  assert.equal(resolveVision({ vision: 'auto' }, 'deepseek-vl-7b'), true)
  assert.equal(resolveVision({ vision: 'auto' }, 'deepseek-v4-flash-vision-exp'), true)
  assert.equal(resolveVision({ vision: 'auto' }, 'deepseek-chat'), false)
  assert.equal(resolveVision({ vision: 'auto' }, 'deepseek-v4-flash'), false)
  assert.equal(resolveVision({ vision: 'auto' }, 'claude-opus-4-8'), true)
  assert.equal(resolveVision({ vision: 'auto' }, 'gpt-4o'), true)
  assert.equal(resolveVision({ vision: 'on' }, 'deepseek-chat'), true)
  assert.equal(resolveVision({ vision: 'off' }, 'claude-opus-4-8'), false)
})

test('shouldStripImagesForModel: FORCE 优先;auto 读白名单', () => {
  assert.equal(shouldStripImagesForModel('deepseek-v4-flash', {}), true)
  assert.equal(shouldStripImagesForModel('claude-opus-4-8', {}), false)
  assert.equal(shouldStripImagesForModel('claude-opus-4-8', { LUMEN_VISION_FORCE: '1' }), true)
  assert.equal(shouldStripImagesForModel('unknown-7b', { LUMEN_VISION_FORCE: '0' }), false)
  assert.equal(shouldStripImagesForModel('unknown-7b', {}, 'auto'), true)
  assert.equal(shouldStripImagesForModel('deepseek-v4-flash', {}, 'on'), false)
})

async function capturedRequest(model: string, vision: VisionMode, messages: Message[]) {
  const replay = createOpenAIReplayTransport([
    { choices: [{ message: { content: 'ok' } }] },
  ])
  const adapter = createOpenAIAdapter({ transport: replay.transport, model, vision })
  const store = new ImageStore()
  const port = shouldStripImagesForModel(model, {}, vision)
    ? withImageSanitize(adapter, store, 't-pipe')
    : adapter
  await port.chat(messages, [])
  return replay.requests[0]!
}

test('分流矩阵:文本档无 image_url 有桩;视觉档原生 image_url;未知 auto 走桩', async () => {
  const withImg: Message[] = [{ role: 'user', content: '看图', images: [img] }]

  const textOff = await capturedRequest('deepseek-v4-flash', 'off', withImg)
  const textBlob = JSON.stringify(textOff)
  assert.equal(textBlob.includes('image_url'), false)
  assert.match(String(textOff.messages[0]!.content), /\[\[image:img-1\]\]/)

  const textAuto = await capturedRequest('deepseek-chat', 'auto', withImg)
  assert.equal(JSON.stringify(textAuto).includes('image_url'), false)
  assert.match(String(textAuto.messages[0]!.content), /\[\[image:img-1\]\]/)

  const visionOn = await capturedRequest('deepseek-v4-flash', 'on', withImg)
  const onBlob = JSON.stringify(visionOn)
  assert.ok(onBlob.includes('image_url'), 'on 覆盖须发像素')
  assert.equal(onBlob.includes('[[image:'), false)

  const visionAuto = await capturedRequest('deepseek-v4-flash-vision-exp', 'auto', withImg)
  const autoBlob = JSON.stringify(visionAuto)
  assert.ok(autoBlob.includes('image_url'))
  assert.equal(autoBlob.includes('[[image:'), false)

  const unknown = await capturedRequest('totally-unknown-7b', 'auto', withImg)
  assert.equal(JSON.stringify(unknown).includes('image_url'), false)
  assert.match(String(unknown.messages[0]!.content), /\[\[image:img-1\]\]/)
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

test('look_at_image 两态描述;视觉态仍注册', () => {
  const store = new ImageStore()
  const env = { baseUrl: 'https://example.test', model: 'vl' }
  let active = false
  const tool = createLookAtImageTool({ store, env, visionActive: () => active })
  assert.equal(tool.spec.name, 'look_at_image')
  assert.match(tool.spec.description, /看不到像素/)
  active = true
  assert.match(tool.spec.description, /可直接看到本回合图片/)
  assert.equal(tool.spec.name, 'look_at_image')
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
  } as ToolContext
  const r = await tool.run({ image_id: 'img-1' }, ctx)
  assert.match(r.llmContent, /未配置识图/)
})
