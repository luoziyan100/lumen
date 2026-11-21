/**
 * [INPUT]: none
 * [OUTPUT]: MODEL_TEXT: the fixed text the UI puts into messages it sends to the model (uploaded-material list, current draft, diagram fix request,
 *           a reading widget's runtime fix request (widgetFix), the two quote lines of a question asked from a widget (widgetAsk, read back by WIDGET_ASK_TITLE), the request to write a reading, a question about a reading's sentence — the reading parser in studio/reading-ask.ts reads the latter back — and a widget's message)
 * [POS]: not a UI catalog and not switched by language: what the model reads stays Chinese until prompts are translated (i18n I8, owner's call).
 *        It lives next to the catalogs so a future prompt translation finds every model-facing string in one folder. The transcript also strips
 *        the material list back out of user messages by matching `uploadedMaterials`, so that marker must not change with the UI language. The service's
 *        `studio/reading-question.ts` keeps its own copy of every program-written form (writeReading, askReading, widgetSend, widgetFix, mermaidFix, the material list)
 *        to tell the person's words from the program's; ui-client/tests/reading.test.ts feeds these real strings to it
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
/** Begins the line under the quote in a reading question; the footprint parser finds questions by it. */
const READING_MARK = '— 解读'
/** The place line of askReading read back: the material's title and the section label */
export const READING_PLACE = /^— 解读《(.*)》· (.*)$/
/** First line of a message a widget sent after the person touched it; the service reads it as not the person's words */
const WIDGET_MARK = '— 小实验'
/** A widget question's quote read back (its lines joined by a space): the widget title */
export const WIDGET_ASK_TITLE = /^小实验「(.*)」(?: 当前参数：.*)?$/

export const MODEL_TEXT = {
  uploadedMaterials: '已上传材料（资料库条目，用 read_material 读）：',
  activeDraft: (path: string) => `当前稿（主题工作区路径）：${path}\n用户正在查看这份稿件；若要求修改它，请先读取现有内容。`,
  writeReading: (title: string, itemId: string) => `请为《${title}》写一份解读。（材料 id：${itemId}）`,
  /** A question asked from a reading: the quote as a Markdown quote, then where it sits, then the person's own words. `READING_MARK` begins the second line. */
  askReading: (quote: string, section: string, item: string, words: string) => `${quote.split('\n').map(line => `> ${line}`).join('\n')}\n${READING_MARK}《${item}》· ${section}\n\n${words}`,
  /** What a widget sends back (a guess, a parameter): the conversation answers it like any message, sediment never keeps it (R13) */
  widgetSend: (text: string) => `${WIDGET_MARK}\n\n${text.trim()}`,
  /** 「请 AI 修正」 under a reading widget that threw at runtime: names where it is and the error, and asks for this one block only; the service reads it as not the person's words */
  widgetFix: (item: string, section: string, title: string, error: string) => `解读里的小实验运行出错：《${item}》· ${section}「${title}」\n\n${error.trim().slice(0, 800)}\n\n请先用 reading_view 找到这一块，只用 reading_write 或 reading_insert 修正这一个小实验，保持其余内容不变。`,
  /** The quote of a question asked from a widget: the title line, then the current values line with toggles as 开/关 */
  widgetAsk: {
    title: (title: string) => `小实验「${title}」`,
    params: (pairs: readonly string[]) => `当前参数：${pairs.join('，')}`,
    on: '开',
    off: '关',
  },
  mermaidFix: (source: string, error: string) => `上面回复里的这张 Mermaid 图无法渲染，解析错误：\n\n${error.trim().slice(0, 800)}\n\n请只重发修正后的这一张图，保持节点和关系不变，不要重写其他内容。\n\n\`\`\`mermaid\n${source}\n\`\`\``,
}
