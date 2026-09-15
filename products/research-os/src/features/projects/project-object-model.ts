/** A project is not a workspace or a conversation, even when the legacy IDs coincide. */
export type ProjectObjectScope = { projectId: string; workspace: string }
export type ProjectFileView = 'files' | 'notes' | 'builds'
export type ProjectFileTarget = ProjectObjectScope & { view: ProjectFileView; path: string }

export function fileTarget(projectId: string, workspace: string, view: ProjectFileView = 'files', path = ''): ProjectFileTarget {
  // Keep paths literal (including Unicode, spaces and percent signs); encode only at transport time.
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('Expected a relative workspace file path.')
  }
  return { projectId, workspace, view, path }
}

export function fileTargetKey(target: ProjectFileTarget): string {
  // A concrete file has one identity, whether reached via Materials or Notes.
  return JSON.stringify([target.projectId, target.workspace, target.path ? 'file' : target.view, target.path])
}

export function sameFileTarget(a: ProjectFileTarget, b: ProjectFileTarget): boolean {
  return fileTargetKey(a) === fileTargetKey(b)
}

export function fileTargetLocation(target: ProjectFileTarget): string {
  return [target.workspace, target.path].filter(Boolean).join('/')
}
