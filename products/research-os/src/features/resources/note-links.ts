import { useCallback, useState } from 'react'
import { useWorkbench } from '../../store'
import { newContextItem } from '../projects/context-model'
import { readDesignFocus } from '../projects/design-focus'
import { addObjectSource, editFailureCopy, editResearchContent } from '../revision/revision-actions'

export type NoteRef = { workspace: string; path: string; title: string; digest: string }

/**
 * Obsidian-style link grammar shared by the reader and the graph inspector:
 * a knowledge note joins the chat context (versioned reference, not pasted text)
 * or is linked to the canvas card currently selected in the active project.
 * Nothing is sent; nothing is linked without a digest to pin the revision.
 */
export function useNoteLinks() {
  const { projectId, addContextItem, locale } = useWorkbench()
  const zh = locale === 'zh'
  const [note, setNote] = useState('')
  const addToChat = useCallback((doc: NoteRef, excerpt?: string) => {
    if (!projectId) { setNote(zh ? '先选择一个项目，再把笔记加入它的对话。' : 'Select a project first, then add the note to its chat.'); return }
    addContextItem(newContextItem({ project: projectId, kind: 'source', label: doc.title, ref: `${doc.workspace}/${doc.path}`, digest: doc.digest, excerpt, source: { id: doc.path, path: doc.path, workspace: doc.workspace, digest: doc.digest } }))
    setNote(zh ? '已加入对话上下文（未发送）。' : 'Added to chat context (not sent).')
  }, [projectId, addContextItem, zh])
  const linkToCard = useCallback(async (doc: NoteRef) => {
    const focus = readDesignFocus(), card = projectId && focus?.project === projectId ? focus.cardIds[0] : undefined
    if (!card) { setNote(zh ? '先在研究画布中选中一张卡片。' : 'Select a card on the research canvas first.'); return }
    const result = await editResearchContent({ projectId, workspace: projectId }, d => addObjectSource(d, card, { kind: 'knowledge', workspace: doc.workspace, path: doc.path, digest: doc.digest, title: doc.title }))
    setNote(result.ok ? (zh ? '已链接到所选卡片。' : 'Linked to the selected card.') : editFailureCopy(result, locale))
  }, [projectId, zh, locale])
  return { projectId, addToChat, linkToCard, note, setNote }
}
