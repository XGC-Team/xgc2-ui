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
