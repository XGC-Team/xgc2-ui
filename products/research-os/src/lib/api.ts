export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || `请求失败（${response.status}）`)
  if (!body || !('data' in body)) throw new Error('服务返回了无法读取的数据。')
  return body.data as T
}
export function post<T>(path: string, body: unknown, key?: string) {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) })
}
export type Project = { id: string; title: string; summary?: string }
export type WorkspaceSummary = { workspaceId: string; branch: string; head?: string; source?: 'external' }
export const listWorkspaces = (signal?: AbortSignal) => request<WorkspaceSummary[]>('/workspaces', { signal })
export const getWorkspaceStatus = (id: string) => request<{ head: string; entries: unknown[] }>(`/workspaces/${encodeURIComponent(id)}/git/status`)
export const collection = async <T>(path: string, signal?: AbortSignal): Promise<T[]> => {
  const data = await request<T[] | {items: T[]}>(path, {signal})
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  throw new Error('服务返回的列表格式不正确。')
}
export function saveDownload(name: string, value: unknown) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = href; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
