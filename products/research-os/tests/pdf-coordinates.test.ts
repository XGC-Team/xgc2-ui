import { describe, expect, it } from 'vitest'
import { pdfRectCenterToSyncTeXPoint, syncTeXBoxToPDFRect } from '../src/features/resources/pdf-coordinates'
import { relativeRect } from '../src/features/resources/pdf-annotations'

describe('SyncTeX and displayed page coordinates', () => {
  // A bottom-anchored line box on a letter-size page. Treating v as top
  // moves the highlighted region and its inverse query down by one full line.
  const box = { x: 48.963875, y: 666.624451, width: 251.058517, height: 11.222122 }
  const page = { w: 612, h: 792 }

  it('highlights above the SyncTeX lower edge and queries the inside center', () => {
    const rect = syncTeXBoxToPDFRect(box, page)
    expect(rect.y * page.h).toBeCloseTo(655.402329)
    expect((rect.y + rect.height) * page.h).toBeCloseTo(box.y)
    const center = pdfRectCenterToSyncTeXPoint(rect, page)
    expect(center.x).toBeCloseTo(174.4931335)
    expect(center.y).toBeCloseTo(661.01339)
    expect(center.y).toBeLessThan(box.y)
  })

  it('returns the same page point from a selected flash region at different zooms and scroll positions', () => {
    const rect = syncTeXBoxToPDFRect(box, page)
    for (const [zoom, left, top] of [[0.6, 1200, -381], [1, 0, 80], [2.25, -77, -1240]]) {
      const bounds = { left, top, width: page.w * zoom, height: page.h * zoom } as DOMRect
      const selected = relativeRect({
        left: left + rect.x * bounds.width,
        top: top + rect.y * bounds.height,
        right: left + (rect.x + rect.width) * bounds.width,
        bottom: top + (rect.y + rect.height) * bounds.height,
      }, bounds)
      const center = pdfRectCenterToSyncTeXPoint(selected, page)
      expect(center.x).toBeCloseTo(174.4931335)
      expect(center.y).toBeCloseTo(661.01339)
    }
  })
})
