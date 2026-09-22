/** Continuous PDF reading: pages stay mounted and the viewport scrolls. */

export type PageSize = { w: number; h: number }
export type PageBox = { page: number; top: number; width: number; height: number }

export const PDF_SCROLL_GAP = 12
export const PDF_SCROLL_PAD = 12

export function pdfPageId(digest: string, page: number): string {
  return `${digest}:page:${page}`
}

export function pageFromPdfId(id: string | null | undefined): number | null {
  const match = id?.match(/:page:(\d+)$/)
  if (!match) return null
  const page = Number(match[1])
  return Number.isInteger(page) && page >= 1 ? page : null
}

export function pdfPageNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number(value)
  return null
}

export const PDF_ZOOM_MIN = 0.5
export const PDF_ZOOM_MAX = 3

/** Wheel up and a pinch-out both arrive as a negative delta and zoom in. */
export function clampPdfZoom(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, value))
}

export function wheelDeltaPixels(delta: number, mode = 0): number {
  if (!Number.isFinite(delta)) return 0
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * 800
  return delta
}

export function nextPdfZoom(current: number, deltaY: number): number {
  const base = clampPdfZoom(current)
  if (!Number.isFinite(deltaY) || deltaY === 0) return base
  return clampPdfZoom(base * Math.exp(-deltaY * 0.0015))
}

/** Ctrl/Cmd+wheel changes the PDF scale. A plain wheel keeps scrolling. */
export function pdfWheelZoom(current: number, gesture: { ctrlKey?: boolean; metaKey?: boolean; deltaY: number; deltaMode?: number }): number | null {
  if (!gesture.ctrlKey && !gesture.metaKey) return null
  const pixels = wheelDeltaPixels(gesture.deltaY, gesture.deltaMode ?? 0)
  if (!pixels) return null
  const next = nextPdfZoom(current, pixels)
  return next === clampPdfZoom(current) ? null : next
}

export type PdfPointHold = {
  page: number
  fractionX: number
  fractionY: number
  viewportX: number
  viewportY: number
}

/** Keep one page point under the same viewport pixel after the pages reflow. */
export function scrollToHoldPoint(input: {
  pageLeft: number
  pageTop: number
  pageWidth: number
  pageHeight: number
  fractionX: number
  fractionY: number
  viewportX: number
  viewportY: number
}): { left: number; top: number } {
  return {
    left: input.pageLeft + input.fractionX * input.pageWidth - input.viewportX,
    top: input.pageTop + input.fractionY * input.pageHeight - input.viewportY,
  }
}

/** Fit the page to the viewport width, then apply the operator zoom. Matches the previous single-page scale. */
export function fitPageScale(pageWidth: number, availableWidth: number, zoom: number): number {
  const width = availableWidth > 0 ? availableWidth : 380
  const fitted = pageWidth > 0 ? (width - PDF_SCROLL_PAD * 2) / pageWidth : 1
  return Math.max(0.35, fitted) * zoom
}

export function layoutPdfPages(sizes: readonly PageSize[], availableWidth: number, zoom: number): PageBox[] {
  let top = 0
  return sizes.map((size, index) => {
    const scale = fitPageScale(size.w, availableWidth, zoom)
    const width = size.w * scale
    const height = size.h * scale
    const box = { page: index + 1, top, width, height }
    top += height + PDF_SCROLL_GAP
    return box
  })
}

/** The page covering the largest share of the viewport. Equal overlap keeps the earlier page. */
export function dominantPdfPage(pages: readonly PageBox[], scrollTop: number, viewportHeight: number): number {
  if (!pages.length) return 1
  const viewTop = scrollTop
  const viewBottom = scrollTop + Math.max(viewportHeight, 1)
  let best = pages[0].page
  let bestOverlap = -1
  for (const page of pages) {
    const overlap = Math.min(page.top + page.height, viewBottom) - Math.max(page.top, viewTop)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = page.page
    }
  }
  return best
}

/** Canvas window around the viewport, plus any pinned page that is part of this document. */
export function pdfPagesToPaint(
  pages: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
  pinned: readonly number[] = [],
): number[] {
  const height = Math.max(viewportHeight, 1)
  const top = scrollTop - height
  const bottom = scrollTop + height * 2
  const painted = new Set<number>()
  for (const page of pages) {
    if (page.top + page.height >= top && page.top <= bottom) painted.add(page.page)
  }
  for (const page of pinned) {
    if (pages.some(item => item.page === page)) painted.add(page)
  }
  if (!painted.size && pages[0]) painted.add(pages[0].page)
  return [...painted].sort((a, b) => a - b)
}

export function samePageSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}
