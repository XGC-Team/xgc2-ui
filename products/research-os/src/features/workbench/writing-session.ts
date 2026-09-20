import { readPreference, writePreference } from '../../lib/storage'

export const RECENT_PROJECTS_KEY = 'research-ui-recent-projects'
export const readingKey = (projectId: string) => `research-ui-reading:${projectId}`

export type ReadingPlace = { path: string; buildId: string; digest: string; page: number }

export function isIdleWebTab(tab: { kind: string; url?: string }): boolean {
  return tab.kind === 'web' && !tab.url
}

export function readReadingPlace(projectId: string): ReadingPlace | null {
  if (!projectId.trim()) return null
  const raw = readPreference(readingKey(projectId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<ReadingPlace>
    if (typeof value.path !== 'string' || !value.path.trim()) return null
    if (typeof value.buildId !== 'string' || !value.buildId.trim()) return null
    if (typeof value.digest !== 'string' || !value.digest.trim()) return null
    const page = Number(value.page)
    if (!Number.isInteger(page) || page < 1) return null
    return { path: value.path, buildId: value.buildId, digest: value.digest, page }
  } catch {
    return null
  }
}

export function writeReadingPlace(projectId: string, place: ReadingPlace): void {
  if (!projectId.trim()) return
  writePreference(readingKey(projectId), JSON.stringify(place))
}

export function readRecentProjects(): string[] {
  const raw = readPreference(RECENT_PROJECTS_KEY)
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id.trim()))]
  } catch {
    return []
  }
}

export function rememberRecentProject(projectId: string): string[] {
  if (!projectId.trim()) return readRecentProjects()
  const next = [projectId, ...readRecentProjects().filter(id => id !== projectId)].slice(0, 8)
  writePreference(RECENT_PROJECTS_KEY, JSON.stringify(next))
  return next
}

export type ProjectRecord = { id?: string; projectId?: string; title?: string }

/** Discover writing projects from registered records plus paper-* workspaces. Do not hard-code manuscript names. */
export function researchProjects(
  spaces: readonly { workspaceId: string }[],
  records: readonly ProjectRecord[],
): { id: string; title: string }[] {
  const titles = new Map<string, string>()
  for (const record of records) {
    const id = record.projectId || record.id
    if (!id?.trim()) continue
    titles.set(id, record.title?.trim() || id)
  }
  const ids = new Set<string>([
    ...titles.keys(),
    ...spaces.filter(space => space.workspaceId.startsWith('paper-')).map(space => space.workspaceId),
  ])
  return [...ids].sort((a, b) => a.localeCompare(b)).map(id => ({ id, title: titles.get(id) || id }))
}

export function matchReadingPdf<T extends { path: string; buildId: string; digest: string }>(
  versions: readonly T[],
  place: ReadingPlace | null,
): T | undefined {
  if (!place) return versions[0]
  return versions.find(item => item.buildId === place.buildId && item.digest === place.digest && item.path === place.path)
    || versions.find(item => item.path === place.path)
    || versions[0]
}
