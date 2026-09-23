import { sourceInsideBuildRoot, validBuildSourceRoot, validSourcePath } from '../review/build-provenance.ts'

const prefix = 'research-manuscript-source-root:v1:'
const entryPrefix='research-manuscript-entry:v1:'
const changes = new Set<() => void>()
const inMemory = new Map<string, string>()
const key = (workspace: string, entryPoint: string) => `${prefix}${JSON.stringify([workspace, entryPoint])}`
export function preferredManuscriptEntry(workspace:string):string {
  try {const value=localStorage.getItem(entryPrefix+workspace);return value&&validSourcePath(value)&&/\.tex$/i.test(value)?value:''}catch{return ''}
}
export function setPreferredManuscriptEntry(workspace:string,entryPoint:string):void {
  if(!workspace||!validSourcePath(entryPoint)||!/\.tex$/i.test(entryPoint))throw new Error('Select an explicit manuscript entry.')
  localStorage.setItem(entryPrefix+workspace,entryPoint);changes.forEach(listener=>listener())
}
export function defaultManuscriptSourceRoot(entryPoint: string): string {
  const slash = entryPoint.lastIndexOf('/')
  return slash < 0 ? '.' : entryPoint.slice(0, slash)
}
export function validateManuscriptSourceRoot(entryPoint: string, sourceRoot: string): void {
  if (!validSourcePath(entryPoint) || !validBuildSourceRoot(sourceRoot) || !sourceInsideBuildRoot(entryPoint, sourceRoot)) throw new Error('Select a workspace-relative source directory containing the manuscript entry. Use . for the whole workspace.')
}
export function manuscriptSourceRoot(workspace: string, entryPoint: string): string {
  const identity = key(workspace, entryPoint)
  try {
    const saved = inMemory.get(identity) ?? localStorage.getItem(identity)
    if (saved) { validateManuscriptSourceRoot(entryPoint, saved); return saved }
  } catch { /* Invalid or unavailable local preferences do not expand the capture. */ }
  return defaultManuscriptSourceRoot(entryPoint)
}
export function setManuscriptSourceRoot(workspace: string, entryPoint: string, sourceRoot: string): void {
  validateManuscriptSourceRoot(entryPoint, sourceRoot)
  const identity = key(workspace, entryPoint)
  // Persist first so a reported storage failure never pretends that a setting was saved.
  localStorage.setItem(identity, sourceRoot)
  inMemory.set(identity, sourceRoot)
  changes.forEach(listener => listener())
}
export function subscribeManuscriptBuildSettings(listener: () => void): () => void {
  changes.add(listener)
  const updated = (event: StorageEvent) => {
    if (!event.key?.startsWith(prefix)&&!event.key?.startsWith(entryPrefix)) return
    inMemory.delete(event.key); listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', updated)
  return () => { changes.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', updated) }
}
