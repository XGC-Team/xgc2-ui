import type { PDFRect } from './pdf-annotations'

export type PDFPageDimensions = { w: number; h: number }
export type SyncTeXBox = { x: number; y: number; width: number; height: number }

/** The API exposes SyncTeX h/v/W/H in page points: v is the box's
 * lower edge, measured down from the page top. DOM/annotation y is its top. */
export function syncTeXBoxToPDFRect(box: SyncTeXBox, page: PDFPageDimensions): PDFRect {
  return { x: box.x / page.w, y: (box.y - box.height) / page.h, width: box.width / page.w, height: box.height / page.h }
}

/** Normalized top-left rectangles do not change with CSS zoom or scrolling.
 * SyncTeX edit takes a point, so select the center inside that rectangle. */
export function pdfRectCenterToSyncTeXPoint(rect: PDFRect, page: PDFPageDimensions): { x: number; y: number } {
  return { x: (rect.x + rect.width / 2) * page.w, y: (rect.y + rect.height / 2) * page.h }
}
