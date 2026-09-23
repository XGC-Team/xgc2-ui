import { useState } from 'react'
import type { DraftScope } from '../projects/draft-model'
import type { ResourceReference } from './content-model'
import { openContentResource } from './resource-navigation'
export function SourceReferenceLink({ source, scope }: { source: ResourceReference; scope: DraftScope }) {
  const [error, setError] = useState('')
  return <div className="space-y-1 text-caption">
    <button type="button" className="w-full break-all text-left text-ink-2 hover:underline" onClick={() => { setError(''); void openContentResource(source, scope).catch(e => setError(String(e.message || e))) }}>{source.path || source.id || source.kind}{source.selector?.page ? ` · p.${source.selector.page}` : ''}</button>
    {source.selector?.quote && <blockquote className="line-clamp-4 whitespace-pre-wrap text-ink-3">{source.selector.quote}</blockquote>}
    {error && <p role="alert" className="text-ink-3">{error}</p>}
  </div>
}
