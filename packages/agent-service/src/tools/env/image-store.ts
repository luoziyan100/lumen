/**
 * [INPUT]: core 的 ImageData / Message
 * [OUTPUT]: ImageStore / formatImagePlaceholder / stripImagesForModel —— 图侧车 + 模型视图去图桩
 * [POS]: DeepSeek 等不吃 image_url 时的句柄层;UI 事件流仍保留原图,仅 forModel/chat 见桩
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import type { ImageData, Message } from '../../core/types.ts'

/** 占位符标记:[[image:img-N]] */
export const IMAGE_ID_RE = /\[\[image:(img-\d+)\]\]/g

export function formatImagePlaceholder(id: string): string {
  return `[[image:${id}]] 用户输入了一张图片。你看不到像素；请调用工具 look_at_image(image_id="${id}") 识图后再回答。`
}

function contentHash(img: ImageData): string {
  return createHash('sha256').update(img.mediaType).update(img.base64).digest('hex').slice(0, 16)
}

interface TaskBucket {
  next: number
  byId: Map<string, ImageData>
  byHash: Map<string, string>
}

/** 任务级图片侧车:序列名 img-1…;同内容哈希复用 id(防 tool loop 重复 stash) */
export class ImageStore {
  private readonly tasks = new Map<string, TaskBucket>()

  private bucket(taskId: string): TaskBucket {
    let b = this.tasks.get(taskId)
    if (!b) {
      b = { next: 1, byId: new Map(), byHash: new Map() }
      this.tasks.set(taskId, b)
    }
    return b
  }

  /** 写入一批图,返回对应 id(已存在则复用) */
  stash(taskId: string, images: ImageData[]): string[] {
    const b = this.bucket(taskId)
    const ids: string[] = []
    for (const img of images) {
      const h = contentHash(img)
      const existing = b.byHash.get(h)
      if (existing) {
        ids.push(existing)
        continue
      }
      const id = `img-${b.next}`
      b.next += 1
      b.byId.set(id, img)
      b.byHash.set(h, id)
      ids.push(id)
    }
    return ids
  }

  /** 恢复/覆盖指定 id(resume 时把事件里的图挂回侧车) */
  put(taskId: string, id: string, img: ImageData): void {
    const b = this.bucket(taskId)
    b.byId.set(id, img)
    b.byHash.set(contentHash(img), id)
    const n = Number(id.replace(/^img-/, ''))
    if (Number.isFinite(n) && n >= b.next) b.next = n + 1
  }

  get(taskId: string, id: string): ImageData | null {
    return this.tasks.get(taskId)?.byId.get(id) ?? null
  }

  clear(taskId: string): void {
    this.tasks.delete(taskId)
  }
}

/**
 * 剥掉 messages[].images,必要时补 [[image:img-N]] 桩,并把像素写入 ImageStore。
 * 不修改入参数组元素(返回新数组)。
 */
export function stripImagesForModel(
  messages: Message[],
  store: ImageStore,
  taskId: string,
): Message[] {
  return messages.map((m) => {
    if (!m.images?.length) {
      if (m.images) {
        const { images: _drop, ...rest } = m
        return rest
      }
      return m
    }

    const found = [...m.content.matchAll(IMAGE_ID_RE)].map((x) => x[1]!).filter(Boolean)
    let content = m.content

    if (found.length >= m.images.length) {
      for (let i = 0; i < m.images.length; i++) store.put(taskId, found[i]!, m.images[i]!)
    } else {
      const ids = store.stash(taskId, m.images)
      const missing = [...new Set(ids.filter((id) => !m.content.includes(`[[image:${id}]]`)))]
      if (missing.length) {
        const stubs = missing.map((id) => formatImagePlaceholder(id)).join('\n')
        content = content.trim() ? `${stubs}\n\n${content}` : stubs
      }
    }

    const { images: _drop, ...rest } = m
    return { ...rest, content }
  })
}
