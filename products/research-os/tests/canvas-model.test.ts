import { describe, expect, it } from 'vitest'
import { canvasToPrompt, emptyCanvasV2, parseEditableCanvas, serializeCanvas, type ThinkingCanvasV2 } from '../src/features/projects/canvas-model'

const sample: ThinkingCanvasV2 = {
  ...emptyCanvasV2(),
  nodes: [
    { id: 'c1', kind: 'chapter', title: 'Introduction', x: 500, y: 500 },
    { id: 'i1', kind: 'idea', title: 'Claim', x: 0, y: 0, body: 'Intent, not manuscript prose.', writing: { argument: 'Explain limits before results.', unwritten: 'Keep the exploratory reasoning in the design.' } },
  ],
  outlines: [{ artifact: 'canvas', items: [{ node: 'c1', children: [{ node: 'i1' }] }] }],
}
describe('current canvas document', () => {
  it('round-trips the current single-source design', () => {
    expect(parseEditableCanvas(serializeCanvas(sample))).toEqual(sample)
  })
  it('rejects malformed, obsolete and dangling data without an empty fallback', () => {
    expect(() => parseEditableCanvas('not json')).toThrow()
    expect(() => parseEditableCanvas(JSON.stringify({ version: 1, nodes: [], edges: [] }))).toThrow()
    expect(() => parseEditableCanvas(JSON.stringify({ ...sample, edges: [{ from: 'c1', to: 'ghost' }] }))).toThrow()
  })
  it('uses explicit order, includes intent and does not depend on visual geometry', () => {
    const prompt = canvasToPrompt(sample, 'Project')
    expect(prompt).toContain('Explain limits before results.')
    expect(prompt).toContain('Keep the exploratory reasoning in the design.')
    expect(prompt.indexOf('Introduction')).toBeLessThan(prompt.indexOf('Claim'))
    expect(canvasToPrompt({ ...sample, nodes: sample.nodes.map(node => ({ ...node, x: -node.x, y: -node.y })) }, 'Project')).toBe(prompt)
  })
})
