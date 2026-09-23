const prefix = (workspace: string) => `research-definition-draft:v1:${workspace}:`
export const definitionDraftKey = (workspace: string, objectId: string): string => `${prefix(workspace)}${objectId}`

/** A hidden object's form is still a pending draft when its workspace tab closes. */
export function hasDefinitionDrafts(workspace: string, storage?: Pick<Storage, 'length' | 'key' | 'getItem'>): boolean {
  try {
    const source = storage ?? localStorage
    for (let i = 0; i < source.length; i++) {
      const key = source.key(i)
      if (!key?.startsWith(prefix(workspace))) continue
      const draft: unknown = JSON.parse(source.getItem(key) || 'null')
      if (draft && typeof draft === 'object' && 'text' in draft && typeof draft.text === 'string') return true
    }
  } catch { /* The active editor separately reports unavailable local storage. */ }
  return false
}
