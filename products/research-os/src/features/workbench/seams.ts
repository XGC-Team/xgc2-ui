/** Adjacent-owner seams. Missing modules stay unavailable; local state is not a write receipt. */

export type WritingConfirmPort = {
  available: false
  detail: string
}

export function writingConfirmPort(): WritingConfirmPort {
  return {
    available: false,
    detail: '确认后改稿由 #128 发布的确认/应用 hook 执行。当前主线没有该导出，界面不得假装已经写入正文。',
  }
}

export type ManuscriptPreviewHook = null

/** B owns useManuscriptBuild. Until that hook is on main, listing existing PDFs stays on listPDFVersions. */
export function manuscriptPreviewHook(): ManuscriptPreviewHook {
  return null
}

export function designFocusModulePresent(): boolean {
  return false
}
