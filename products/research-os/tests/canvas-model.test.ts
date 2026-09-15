import {describe,expect,it} from 'vitest'
import {canvasToPrompt,emptyCanvas,parseCanvas,serializeCanvas,type ThinkingCanvas} from '../src/features/projects/canvas-model'

const sample: ThinkingCanvas = {
  version: 1,
  nodes: [
    { id: 'c1', kind: 'chapter', title: '引言', x: 0, y: 0, anchor: 'main.tex' },
    { id: 'i1', kind: 'idea', title: '贡献点三条', body: '先讲方法\n再讲实验', x: 300, y: 40, ref: { path: 'papers/foo.md', title: 'Foo' } },
    { id: 'i2', kind: 'idea', title: '散落想法', x: 0, y: 400 },
  ],
  edges: [{ from: 'c1', to: 'i1' }, { from: 'c1', to: 'ghost' }],
}

describe('canvas-model', () => {
  it('parse 容忍坏 JSON 与幽灵边', () => {
    expect(parseCanvas('not json')).toEqual(emptyCanvas())
    const parsed = parseCanvas(serializeCanvas(sample))
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.edges).toHaveLength(1) // ghost 边被滤掉
  })
  it('prompt：章节有序、想法归章、引用与锚点落字', () => {
    const prompt = canvasToPrompt(sample, '论文复现')
    expect(prompt).toContain('# 论文复现 · 写作蓝图')
    expect(prompt).toContain('1. 引言 @main.tex')
    expect(prompt).toContain('- 贡献点三条 [[papers/foo.md]]')
    expect(prompt).toContain('先讲方法 再讲实验')
    expect(prompt).toContain('## 待归档想法')
    expect(prompt).toContain('- 散落想法')
  })
})
