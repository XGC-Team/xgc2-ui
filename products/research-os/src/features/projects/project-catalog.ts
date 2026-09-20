/** A read-only projection of the project catalog and accessible workspaces. */
export type CatalogProject = {id: string; title: string; summary?: string; accessible: boolean}
export type CatalogWorkspace = {workspaceId: string}
export type CatalogRecord = {projectId: string; title: string; summary?: string}

export function projectCatalog(records: readonly CatalogRecord[], workspaces: readonly CatalogWorkspace[]) {
  const accessible = new Set(workspaces.map(workspace => workspace.workspaceId))
  const seen = new Set<string>()
  const projects = records.map(record => {
    if (!record || typeof record.projectId !== 'string' || !record.projectId.trim() ||
      typeof record.title !== 'string' || !record.title.trim() || seen.has(record.projectId)) {
      throw new Error('The project catalog contains an invalid or duplicate project.')
    }
    seen.add(record.projectId)
    return {id: record.projectId, title: record.title, summary: record.summary,
      accessible: accessible.has(record.projectId)} satisfies CatalogProject
  })
  return {projects, unregistered: workspaces.filter(workspace => !seen.has(workspace.workspaceId))}
}

/** Recency is a view preference, never a second project catalog or an activity claim. */
export function recentProjects<T extends {id: string}>(projects: readonly T[], recent: readonly string[]): T[] {
  const rank = new Map(recent.map((id, index) => [id, index]))
  return [...projects].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
}

export function rememberProject(recent: readonly string[], id: string): string[] {
  return id ? [id, ...recent.filter(existing => existing !== id)].slice(0, 24) : [...recent]
}

export function readRecentProjects(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every(id => typeof id === 'string' && !!id)
      ? [...new Set(value)].slice(0, 24) : []
  } catch { return [] }
}
