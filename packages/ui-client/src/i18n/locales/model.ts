/**
 * [INPUT]: none
 * [OUTPUT]: MODEL_TEXT: the fixed text the UI puts into messages it sends to the model (uploaded-material list, current draft, diagram fix request)
 * [POS]: not a UI catalog and not switched by language: what the model reads stays Chinese until prompts are translated (i18n I8, owner's call).
 *        It lives next to the catalogs so a future prompt translation finds every model-facing string in one folder. The transcript also strips
 *        the material list back out of user messages by matching `uploadedMaterials`, so that marker must not change with the UI language
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export const MODEL_TEXT = {
  uploadedMaterials: '已上传材料（资料库条目，用 read_material 读）：',
  activeDraft: (path: string) => `当前稿（主题工作区路径）：${path}\n用户正在查看这份稿件；若要求修改它，请先读取现有内容。`,
  mermaidFix: (source: string, error: string) => `上面回复里的这张 Mermaid 图无法渲染，解析错误：\n\n${error.trim().slice(0, 800)}\n\n请只重发修正后的这一张图，保持节点和关系不变，不要重写其他内容。\n\n\`\`\`mermaid\n${source}\n\`\`\``,
}
