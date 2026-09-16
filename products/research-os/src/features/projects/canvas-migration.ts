import { request } from '../../lib/api.ts'
import { CANVAS_V1_BACKUP_PATH } from './canvas-model.ts'
import type { FilePort } from './file-session'

/** Read the format version without accepting the file; unknown versions stay the loader's problem. */
export function detectCanvasVersion(text: string): 1 | 2 | undefined {
  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const version = (raw as { version?: unknown }).version
      if (version === 1 || version === 2) return version
    }
  } catch { /* damaged files are rejected by the session decoder */ }
  return undefined
}

/** createOnly backup of the original v1 bytes. An existing backup (409) is already the safety copy. */
export async function backupCanvasV1(project: string, content: string): Promise<void> {
  const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_V1_BACKUP_PATH}`
  try {
    await request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, createOnly: true }) })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) return
    throw new Error(`Canvas v1 backup failed; the v2 file was not written. ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The v1→v2 safety rule around the sole canvas writer: the first v2 write after loading a v1 file
 * lands a createOnly backup of the original bytes first; if the backup fails, no v2 is written. */
export function wrapMigratingPort(base: FilePort, backup: (content: string) => Promise<void>): FilePort {
  let pendingV1: string | null = null
  return {
    read: async signal => {
      const record = await base.read(signal)
      pendingV1 = typeof record?.content === 'string' && detectCanvasVersion(record.content) === 1 ? record.content : null
      return record
    },
    write: async input => {
      if (pendingV1 !== null) {
        await backup(pendingV1)
        pendingV1 = null
      }
      return base.write(input)
    },
  }
}
