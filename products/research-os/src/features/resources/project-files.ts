export type ProjectEntry={kind:'directory'|'file';path:string;sizeBytes:number}
const excluded=new Set(['source','src','scripts','tools','config','configs','node_modules','vendor','external','build','dist','target','__pycache__','venv','ros1_ws'])
const material=/\.(md|mdx|txt|tex|bib|sty|cls|bst|cfg|def|pdf|csv|tsv|png|jpe?g|svg|webp|gif|eps|docx?|pptx?|xlsx?|odt|zip)$/i
export function isProjectMaterial(entry:ProjectEntry){
 const parts=entry.path.split('/'),name=parts[parts.length-1]
 if(parts.some(part=>part.startsWith('.')||excluded.has(part.toLowerCase()))||name.startsWith('~$'))return false
 return entry.kind==='directory'||(material.test(name)&&! /^(AGENTS|CLAUDE|GEMINI|CONTRIBUTING|LICENSE|CHANGELOG)\b/i.test(name))
}
export const isTextMaterial=(path:string)=>/\.(md|mdx|txt|tex|bib|sty|cls|bst|cfg|def|csv|tsv)$/i.test(path)

/** All pages of one directory. Do not treat transport/protocol errors as an empty directory. */
export async function listProjectMaterials(workspace: string, directory: string, signal?: AbortSignal): Promise<ProjectEntry[]> {
  const entries = new Map<string, ProjectEntry>()
  const seen = new Set<string>()
  let cursor = ''
  do {
    signal?.throwIfAborted()
    const query = new URLSearchParams({ directory, limit: '200', ...(cursor ? { cursor } : {}) })
    const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspace)}/files?${query}`, { signal })
    const body = await response.json()
    if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`)
    if (!Array.isArray(body?.data) || body.meta?.directory !== directory) throw new Error('Invalid directory response.')
    for (const entry of body.data) {
      if (!entry || typeof entry.path !== 'string' || !['file', 'directory'].includes(entry.kind)) throw new Error('Invalid directory entry.')
      if (isProjectMaterial(entry)) entries.set(entry.path, entry)
    }
    const next: unknown = body.meta.nextCursor
    if (next != null && typeof next !== 'string') throw new Error('Invalid directory cursor.')
    cursor = typeof next === 'string' ? next : ''
    if (cursor && seen.has(cursor)) throw new Error('Repeated directory cursor.')
    seen.add(cursor)
  } while (cursor)
  signal?.throwIfAborted()
  return [...entries.values()].sort((a, b) => Number(a.kind === 'file') - Number(b.kind === 'file') || a.path.localeCompare(b.path))
}
