import type { DraftScope } from '../projects/draft-model.ts'
import { newContextItem, type ContextItem } from '../projects/context-model.ts'
import { READING_SELECTION_SCHEMA, type PageProjection, type QuoteVerification, type ReadingSelection } from './types.ts'

function requireSelection(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }

export function excerptOnPage(projection: PageProjection, excerpt: string): boolean {
  const quote = excerpt.trim()
  if (!quote) return false
  if (projection.unit.text.includes(quote)) return true
  return projection.blocks.some(block => block.text.includes(quote))
}

export function readingSelection(input: {
  scope: DraftScope
  archive: { workId: string; manifestationId: string; documentVersionId: string; acquisitionId: string; sourceSha256: string }
  projection?: PageProjection
  page: number
  excerpt: string
  verification?: QuoteVerification
}): ReadingSelection {
  const excerpt = input.excerpt.trim()
  requireSelection(input.scope.projectId.trim() && input.scope.workspace.trim(), 'Reading selection requires a project scope.')
  requireSelection(input.archive.sourceSha256.length === 64 && input.page > 0 && excerpt, 'Reading selection requires archived identity, page and excerpt.')
  const verified = input.verification?.verified === true
  return {
    schema: READING_SELECTION_SCHEMA,
    projectId: input.scope.projectId,
    workspace: input.scope.workspace,
    workId: input.archive.workId,
    manifestationId: input.archive.manifestationId,
    documentVersionId: input.archive.documentVersionId,
    acquisitionId: input.archive.acquisitionId,
    sourceSha256: input.archive.sourceSha256,
    snapshotSha256: input.projection?.snapshotSha256,
    evidenceArtifactId: input.projection?.evidenceArtifactId,
    evidenceArtifactSha256: input.projection?.evidenceArtifactSha256,
    readingSessionId: input.projection?.sessionId,
    page: input.page,
    excerpt,
    verification: verified && input.verification ? input.verification : { status: 'unverified', verified: false },
  }
}

/** Adding to Chat context never sends. External PDFs stay archived documents, not manuscript builds. */
export function selectionToContextItem(selection: ReadingSelection, label?: string): ContextItem {
  requireSelection(selection.schema === READING_SELECTION_SCHEMA, 'Unsupported reading selection schema.')
  requireSelection(!('buildId' in selection), 'External literature cannot pretend to be a manuscript build.')
  return newContextItem({
    project: selection.projectId,
    kind: 'source',
    label: label || selection.excerpt.slice(0, 80),
    ref: `archived-document:${selection.sourceSha256}#page=${selection.page}`,
    digest: selection.snapshotSha256 || selection.sourceSha256,
    excerpt: selection.excerpt,
    source: {
      id: selection.readingSessionId || selection.acquisitionId,
      path: `documents/${selection.sourceSha256}`,
      workspace: selection.workspace,
      digest: selection.sourceSha256,
      excerpt: selection.excerpt,
      page: selection.page,
    },
  })
}

export function citationAnchor(selection: ReadingSelection) {
  return {
    documentVersionId: selection.documentVersionId,
    derivativeArtifactId: selection.evidenceArtifactId,
    artifactSha256: selection.evidenceArtifactSha256,
    pageStart: selection.page,
    pageEnd: selection.verification && 'resolvedPage' in selection.verification && selection.verification.resolvedPage
      ? selection.verification.resolvedPage : selection.page,
    quote: selection.excerpt,
    quoteSha256: selection.verification && 'quoteSha256' in selection.verification ? selection.verification.quoteSha256 : undefined,
  }
}
