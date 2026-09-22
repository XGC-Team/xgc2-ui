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

/** The left project list opens only these two manuscripts. Other paper workspaces stay untouched. */
export const OPEN_MANUSCRIPTS = [
  { id: 'paper-homo-dmpc', title: '同构' },
  { id: 'paper-hetero-dmpc', title: '异构' },
] as const

export function researchProjects(
  spaces: readonly { workspaceId: string }[],
  records: readonly ProjectRecord[],
): { id: string; title: string }[] {
  const present = new Set<string>()
  for (const space of spaces) present.add(space.workspaceId)
  for (const record of records) {
    const id = record.projectId || record.id
    if (id?.trim()) present.add(id)
  }
  return OPEN_MANUSCRIPTS.filter(item => present.has(item.id)).map(item => ({ id: item.id, title: item.title }))
}

/** The current preview is the newest successful PDF of that entry.
 * A remembered page must not keep a superseded compile, including an older engine's PDF. */
export function matchReadingPdf<T extends { path: string; buildId: string; digest: string }>(
  versions: readonly T[],
  place: ReadingPlace | null,
): T | undefined {
  if (!versions.length) return undefined
  if (!place) return versions[0]
  return versions.find(item => item.path === place.path) ?? versions[0]
}
