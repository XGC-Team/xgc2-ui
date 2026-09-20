import type { ManuscriptPDF } from '../resources/manuscript'
import type { PDFAnchor } from '../resources/pdf-annotations'
import type { Anchor } from '../review/review-model'

/** Chat text for a submitted PDF annotation. This starts a design discussion; it is not a write grant. */
export function annotationDiscussion(input: {
  workspace: string
  path: string
  buildId: string
  digest: string
  page: number
  kind: PDFAnchor['kind']
  quote: string
  comment: string
}): string {
  return [
    'PDF 批注。请先对照当前设计稿讨论准备表达什么、改哪里、为什么；在设计确认前不要改正文。',
    `项目：${input.workspace}`,
    `稿件：${input.path}`,
    `构建：${input.buildId}`,
    `PDF 版本：${input.digest}`,
    `页：${input.page}`,
    `定位：${input.kind}`,
    `原文：${input.quote.trim() || '此区域没有可提取文字。'}`,
    `批注：${input.comment.trim()}`,
  ].join('\n')
}

export function pdfFeedbackAnchor(pdf: ManuscriptPDF, anchor: PDFAnchor): Anchor {
  return {
    kind: 'pdf',
    workspace: pdf.workspace,
    path: pdf.path,
    digest: pdf.digest,
    quote: anchor.quote,
    buildId: pdf.buildId,
    page: anchor.page,
    rects: anchor.rects,
    origin: 'project-build',
  }
}

export function bypassesDesignConfirmation(text: string): boolean {
  return /请根据以下 PDF 批注修改稿件|Revise the manuscript from this PDF annotation/i.test(text)
}
