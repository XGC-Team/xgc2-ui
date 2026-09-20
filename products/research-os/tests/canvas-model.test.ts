import {describe,expect,it} from 'vitest'
import {
  canvasToPrompt,emptyCanvas,parseCanvas,parseEditableCanvas,serializeCanvas,setNodeWriting,
  type ThinkingCanvasV2,
} from '../src/features/projects/canvas-model'

const sample: ThinkingCanvasV2 = {
  version: 2,
  nodes: [
    { id: 'c1', kind: 'chapter', title: '引言', x: 0, y: 0, anchor: 'research-drafts.json#note-1' },
    { id: 'i1', kind: 'idea', title: '贡献点三条', body: '先讲方法\n再讲实验', x: 300, y: 40, ref: { path: 'papers/foo.md', title: 'Foo' },
      writing: { purpose: '引出缺口', omission: '推导细节' },
      bindings: [{ id: 'b1', workspace: 'paper', path: 'main.tex', digest: 'd1', quote: 'claim', start: 0, end: 5 }] },
    { id: 'i2', kind: 'idea', title: '散落想法', x: 0, y: 400 },
  ],
  edges: [{ from: 'c1', to: 'i1', relation: 'supports' }],
  outlines: [{ artifact: 'canvas', items: [{ node: 'c1', children: [{ node: 'i1' }] }] }],
}

describe('canvas-model', () => {
  it('read-only parse yields no nodes for damaged or v1 files and never invents a canvas', () => {
    expect(parseCanvas('not json')).toEqual({ nodes: [] })
    expect(parseCanvas(JSON.stringify({ version: 1, nodes: sample.nodes, edges: [] }))).toEqual({ nodes: [] })
    expect(parseCanvas(serializeCanvas(sample)).nodes).toHaveLength(3)
  })
  it('editable parse is v2-only and fail-closed', () => {
    expect(() => parseEditableCanvas(JSON.stringify({ version: 1, nodes: [], edges: [] }))).toThrow(/Unsupported/)
    expect(parseEditableCanvas(serializeCanvas(emptyCanvas()))).toEqual(emptyCanvas())
  })
  it('prompt follows the outline, keeps omission off the manuscript, and lists source bindings', () => {
    const prompt = canvasToPrompt(sample, '论文复现')
    expect(prompt).toContain('# 论文复现 · 写作蓝图')
    expect(prompt).toContain('1. 引言 @research-drafts.json#note-1')
    expect(prompt).toContain('- 贡献点三条 [[papers/foo.md]]')
    expect(prompt).toContain('先讲方法 再讲实验')
    expect(prompt).toContain('写作目的： 引出缺口')
    expect(prompt).toContain('详略（不得写入正文）： 推导细节')
    expect(prompt).toContain('对应正文： main.tex@d1 「claim」')
    expect(prompt).toContain('## 语义关系\n- 引言 支持 贡献点三条')
    expect(prompt).toContain('## 待归档想法')
    expect(prompt).toContain('- 散落想法')
  })
  it('cleared writing fields disappear instead of remaining as empty strings', () => {
    const cleared = setNodeWriting(sample, 'i1', 'purpose', '')
    expect(cleared.nodes.find(node => node.id === 'i1')?.writing).toEqual({ omission: '推导细节' })
  })
})
