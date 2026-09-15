/* 网址归一化与识别：全局搜索（CommandPalette）与网页标签共用的唯一入口逻辑。
   局部地址栏已按标注退场——输入网址只走顶栏全局搜索。 */
export function normalizeWebUrl(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('empty')
  const url = new URL(/^https?:\/\//i.test(value) ? value : `${/^(localhost|127\.0\.0\.1)(:|\/|$)/.test(value) ? 'http' : 'https'}://${value}`)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('not-http')
  if (typeof window !== 'undefined' && url.origin === window.location.origin) throw new Error('self')
  return url.href
}
export function looksLikeUrl(query: string): boolean {
  const value = query.trim()
  if (!value || /\s/.test(value)) return false
  if (/^https?:\/\/\S+$/i.test(value)) return true
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(value)) return true
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(value)
}
