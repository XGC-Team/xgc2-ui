import { describe, expect, it } from 'vitest'
import { answeredCards, extractSourcePatches, resolveSourcePatch, sourcePatchContract, sourcePatchProposal, sourceProposalId } from '../src/features/revision/source-patch'
import { validateProposal } from '../src/features/review/review-model'
import { patchTarget } from '../src/features/review/review-targets'

const tex = '\\section{Method}\nTheorem 1: if $\\alpha < 1$, the error converges.\n\\section{Experiments}\nWe compare against PID on 12 flights.\n'
const files = { 'manuscript/main.tex': { content: tex, digest: 'sha256:m1' } }
const scope = { projectId: 'paper-lab', workspace: 'paper-lab' }
const reply = (json: unknown) => `Here is the edit.\n\`\`\`research-source-patch\n${JSON.stringify(json)}\n\`\`\`\n`

describe('agent manuscript edits (research-source-patch)', () => {
  it('extracts fenced patches and reports malformed ones instead of guessing', () => {
    const ok = extractSourcePatches(reply({ summary: 'Bound alpha', edits: [{ path: 'manuscript/main.tex', before: 'if $\\alpha < 1$', after: 'if the projected $\\alpha < 1$', reason: 'R1.1', cards: ['r1'] }] }))
    expect(ok[0].patch!.edits[0]).toMatchObject({ path: 'manuscript/main.tex', cards: ['r1'] })
    expect(extractSourcePatches(reply({ edits: [{ path: '../etc/passwd', before: 'a', after: 'b' }] }))[0].error).toMatch(/path/)
    expect(extractSourcePatches(reply({ edits: [{ path: 'main.pdf', before: 'a', after: 'b' }] }))[0].error).toMatch(/path/)
    expect(extractSourcePatches(reply({ edits: [{ path: 'main.tex', before: 'a', after: 'a' }] }))[0].error).toMatch(/identical/)
    expect(extractSourcePatches('```research-source-patch\nnot json\n```')[0].error).toBeTruthy()
  })
  it('locates edits only by a unique exact quote of the saved text', () => {
    const patch = { edits: [
      { path: 'manuscript/main.tex', before: 'PID on 12 flights', after: 'PID and MPC on 12 flights', reason: 'R1.2' },
      { path: 'manuscript/main.tex', before: '\\section', after: '\\section*', reason: 'ambiguous' },
      { path: 'manuscript/main.tex', before: 'not in the file', after: 'x', reason: 'stale' },
      { path: 'manuscript/other.tex', before: 'x', after: 'y', reason: 'missing' },
    ] }
    const { edits, problems } = resolveSourcePatch(patch, { ...files, 'manuscript/other.tex': null })
    expect(edits).toHaveLength(1)
    expect(tex.slice(edits[0].start, edits[0].end)).toBe('PID on 12 flights')
    expect(problems.join(' ')).toMatch(/more than once/); expect(problems.join(' ')).toMatch(/not in the saved/); expect(problems.join(' ')).toMatch(/not found/)
  })
  it('becomes a valid journal proposal whose operations patch the saved file and cite the answered cards', () => {
    const patch = { summary: 'Address R1', edits: [
      { path: 'manuscript/main.tex', before: 'if $\\alpha < 1$', after: 'if the projected $\\alpha < 1$', reason: 'R1.1', cards: ['r1'] },
      { path: 'manuscript/main.tex', before: 'PID on 12 flights', after: 'PID and MPC on 12 flights', reason: 'R1.2', cards: ['r2', 'unknown'] },
    ] }
    const { edits } = resolveSourcePatch(patch, files)
    const id = sourceProposalId('s_d98185', 'msg-7', 0)
    const p = sourcePatchProposal({ scope, id, author: 'researcher', at: new Date('2026-09-24T10:00:00Z'), label: 'claude · s_d98185', patch, edits, cards: [{ id: 'r1', title: 'Bound alpha' }, { id: 'r2', title: 'Compare MPC' }], contentDigest: 'sha256:c1', locale: 'en' })
    expect(() => validateProposal(p, scope)).not.toThrow()
    expect(p.title).toBe('Address R1')
    expect(answeredCards(p)).toEqual(['r1', 'r2'])
    expect(patchTarget(tex, p.operations, scope)).toBe(tex.replace('if $\\alpha < 1$', 'if the projected $\\alpha < 1$').replace('PID on 12 flights', 'PID and MPC on 12 flights'))
    expect(sourceProposalId('s_d98185', 'msg-7', 0)).toBe(id)
  })
  it('tells the agent the real file list and that nothing compiles automatically', () => {
    expect(sourcePatchContract('en', ['manuscript/main.tex'])).toMatch(/manuscript\/main\.tex[\s\S]*research-source-patch[\s\S]*no PDF is compiled/)
    expect(sourcePatchContract('en', [])).toMatch(/no \.tex\/\.md manuscript/)
  })
})

describe('manuscript excerpt in the thread brief', async () => {
  const { manuscriptExcerpt } = await import('../src/features/revision/source-patch')
  it('pins each file to its digest and stays within budget', () => {
    const out = manuscriptExcerpt([{ path: 'a.tex', content: 'x'.repeat(50), digest: 'sha256:a' }, { path: 'b.tex', content: 'y'.repeat(50), digest: 'sha256:b' }], 70)
    expect(out).toContain('a.tex @ sha256:a'); expect(out).toContain('b.tex @ sha256:b'); expect(out).toContain('truncated')
    expect(manuscriptExcerpt([], 100)).toBe('')
  })
})
