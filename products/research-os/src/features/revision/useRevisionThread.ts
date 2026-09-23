import { useCallback } from 'react'
import { useWorkbench } from '../../store'
import { useNativeAgentSession } from '../chat/Session'
import { sharedContentSession } from '../content/useContentDocument'
import { cardType } from '../content/content-model'
import { revisionThreadSeed } from './revision-model'

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
    native.appendDraft(revisionThreadSeed({ project, locale: state.locale, items }), project)
  }, [native])
}
