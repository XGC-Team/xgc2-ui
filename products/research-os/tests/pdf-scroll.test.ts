import { describe, expect, it } from 'vitest'
import {
  dominantPdfPage,
  fitPageScale,
  layoutPdfPages,
  nextPdfZoom,
  pageFromPdfId,
  pdfPageId,
  pdfPageNumber,
  pdfPagesToPaint,
  pdfWheelZoom,
  scrollToHoldPoint,
} from '../src/features/resources/pdf-scroll'

const letter = { w: 612, h: 792 }

describe('continuous PDF scroll', () => {
  it('keeps the previous fit-width scale', () => {
    expect(fitPageScale(612, 420, 1)).toBeCloseTo(Math.max(0.35, (420 - 24) / 612))
    expect(fitPageScale(612, 420, 2)).toBeCloseTo(Math.max(0.35, (420 - 24) / 612) * 2)
    expect(fitPageScale(2000, 0, 1)).toBeCloseTo(Math.max(0.35, (380 - 24) / 2000))
  })

  it('stacks every page so later pages remain in the same scroll', () => {
    const layout = layoutPdfPages(Array.from({ length: 16 }, () => letter), 420, 1)
    expect(layout).toHaveLength(16)
    expect(layout[0].top).toBe(0)
    expect(layout[1].top).toBeCloseTo(layout[0].height + 12)
    expect(layout[15].top).toBeGreaterThan(layout[14].top + layout[14].height)
    expect(pdfPageId('abc', 1)).toBe('abc:page:1')
    expect(pageFromPdfId('5faa9739:page:1')).toBe(1)
    expect(pageFromPdfId('5faa9739:page:11')).toBe(11)
    expect(pageFromPdfId('5faa9739:page:1:extra')).toBeNull()
    expect(pdfPageNumber('16')).toBe(16)
    expect(pdfPageNumber(0)).toBeNull()
  })

  it('tracks the page that occupies the viewport and paints only the nearby canvases', () => {
    const layout = layoutPdfPages(Array.from({ length: 16 }, () => letter), 420, 1)
    const height = layout[0].height
    expect(dominantPdfPage(layout, 0, height)).toBe(1)
    expect(pdfPagesToPaint(layout, 0, height)).toEqual(expect.arrayContaining([1]))
    expect(pdfPagesToPaint(layout, 0, height)).not.toContain(16)
    const last = layout[15].top
    expect(dominantPdfPage(layout, last, height)).toBe(16)
    expect(pdfPagesToPaint(layout, last, height)).toContain(16)
    expect(pdfPagesToPaint(layout, last, height)).not.toContain(1)
    expect(pdfPagesToPaint(layout, last, height, [1])).toEqual(expect.arrayContaining([1, 16]))
  })

  it('zooms the PDF from the wheel without taking over a plain scroll', () => {
    expect(pdfWheelZoom(1, { deltaY: -100 })).toBeNull()
    const zoomIn = pdfWheelZoom(1, { ctrlKey: true, deltaY: -100 })
    const zoomOut = pdfWheelZoom(1, { metaKey: true, deltaY: 100 })
    expect(zoomIn).toBeGreaterThan(1)
    expect(zoomOut).toBeLessThan(1)
    expect(pdfWheelZoom(3, { ctrlKey: true, deltaY: -400 })).toBeNull()
    expect(pdfWheelZoom(0.5, { ctrlKey: true, deltaY: 400 })).toBeNull()
    expect(nextPdfZoom(1, -16)).toBeGreaterThan(1)
    expect(pdfWheelZoom(1, { ctrlKey: true, deltaY: -4, deltaMode: 1 })).toBeCloseTo(nextPdfZoom(1, -64), 5)
  })

  it('keeps the page point under the pointer after a zoom reflow', () => {
    const before = { pageLeft: 40, pageTop: 120, pageWidth: 400, pageHeight: 520, fractionX: 0.25, fractionY: 0.5, viewportX: 80, viewportY: 200 }
    const held = scrollToHoldPoint(before)
    expect(before.pageLeft + before.fractionX * before.pageWidth - held.left).toBeCloseTo(before.viewportX)
    expect(before.pageTop + before.fractionY * before.pageHeight - held.top).toBeCloseTo(before.viewportY)
    const grown = scrollToHoldPoint({ ...before, pageLeft: 10, pageTop: 80, pageWidth: 800, pageHeight: 1040 })
    expect(10 + 0.25 * 800 - grown.left).toBeCloseTo(before.viewportX)
    expect(80 + 0.5 * 1040 - grown.top).toBeCloseTo(before.viewportY)
  })

  it('keeps the earlier page when two pages share the viewport equally', () => {
    const pages = [
      { page: 1, top: 0, width: 100, height: 100 },
      { page: 2, top: 112, width: 100, height: 100 },
    ]
    expect(dominantPdfPage(pages, 56, 100)).toBe(1)
  })
})
