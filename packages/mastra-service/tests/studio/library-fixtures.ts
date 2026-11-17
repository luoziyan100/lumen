/**
 * [INPUT]: none; hand-written PDF objects and arXiv API Atom text
 * [OUTPUT]: titledPdf (a one-page PDF with an optional Info Title, several font sizes and a rotated watermark), pagedPdf (one text line per entry, one page per array), atom (one arXiv API result)
 * [POS]: shared fixtures for the library title and reading tests; not a test file, no assertions
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export function titledPdf({ info, lines = [], rotated }: { info?: string; lines?: [size: number, text: string][]; rotated?: string }): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, match => `\\${match}`)
  const stream = [...lines.map(([size, text], i) => `BT /F1 ${size} Tf 40 ${700 - i * 40} Td (${escape(text)}) Tj ET`),
    ...(rotated ? [`BT /F1 30 Tf 0 1 -1 0 20 100 Tm (${escape(rotated)}) Tj ET`] : [])].join('\n')
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, `<< /Producer (pdfTeX-1.40.25)${info === undefined ? '' : ` /Title (${escape(info)})`} >>`]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

/** Several pages, each a list of text lines, so quote checks can tell pages apart. */
export function pagedPdf(pages: string[][]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, match => `\\${match}`)
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  for (const [i, lines] of pages.entries()) {
    const stream = lines.map((text, n) => `BT /F1 11 Tf 40 ${740 - n * 18} Td (${escape(text)}) Tj ET`).join('\n')
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

export function atom(id: string, title: string, authors: string[], published = '2017-06-12T17:57:34Z') {
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv Query</title><entry><id>http://arxiv.org/abs/${id}</id>
<published>${published}</published><title>${title}</title>${authors.map(name => `<author><name>${name}</name></author>`).join('')}</entry></feed>`
}

