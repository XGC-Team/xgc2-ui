import { useCallback } from 'react'
import { useWorkbench } from '../../store'
import { useNativeAgentSession } from '../chat/Session'
import { sharedContentSession } from '../content/useContentDocument'
import { cardType } from '../content/content-model'
import { revisionThreadSeed } from './revision-model'
import { manuscriptExcerpt, sourcePatchContract } from './source-patch'
import { listManuscriptFiles, readSaved } from './revision-actions'

const PROJECT_SCOPES = ['research-repository', 'research-project', 'research-project-discussion']

/** The project a live native session is bound to, or '' for a global / absent session. */
export function sessionProject(session: { scope: { context: { kind: string; id: string } } } | undefined | null): string {
  return session && PROJECT_SCOPES.includes(session.scope.context.kind) ? session.scope.context.id : ''
}

/** Open the review-driven revision layout: a new project thread docked beside the revision board and the PDF side.
 * The thread is only drafted — the seed lands in the composer and nothing is sent. */
export function useStartRevisionThread() {
  const native = useNativeAgentSession()
  return useCallback(async (project: string) => {
    const state = useWorkbench.getState()
    state.enterWritingProject(project)
    native.newThread()
    state.setChatDock(true)
    useWorkbench.getState().openResource({ kind: 'research', workspace: project, view: 'revision' }, 'primary')
    // Read the saved items before drafting so the seed lists them even when no content view has loaded yet.
    let items: Parameters<typeof revisionThreadSeed>[0]['items'] = []
    try {
      const session = sharedContentSession({ projectId: project, workspace: project })
      if (session.snapshot().status === 'loading') await session.load()
      items = (session.snapshot().value?.objects ?? []).filter(object => cardType(object) === 'revision')
    } catch { /* The seed then says there are no items yet; the board stays the source of truth. */ }
    // The contract and item list ride along with the first message as a visible brief; the composer keeps one plain sentence.
    const zh = state.locale === 'zh'
    // The brief also carries how to propose manuscript edits, and which source files exist (read, not guessed).
    const files = await listManuscriptFiles(project)
    const saved = (await Promise.all(files.filter(f => f.endsWith('.tex')).slice(0, 3).map(async path => { try { const f = await readSaved(project, path); return f ? { path, ...f } : null } catch { return null } }))).filter((f): f is { path: string; content: string; digest: string } => Boolean(f))
    useWorkbench.getState().setThreadBrief(project, { label: zh ? `修订约定 · ${items.length} 项` : `Revision brief · ${items.length} item(s)`, text: `${revisionThreadSeed({ project, locale: state.locale, items })}${sourcePatchContract(state.locale, files)}\n${manuscriptExcerpt(saved)}\n` })
    native.appendDraft(zh ? '请逐条过一遍审稿意见，先给出每条的修订方案（接受 / 部分接受 / 反驳 + 证据）。' : 'Go through the reviewer comments one by one and propose a revision plan for each (accept / partly accept / rebut + evidence).', project)
  }, [native])
}
