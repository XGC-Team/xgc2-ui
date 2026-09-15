/** Layout policy only. Research data and execution stay in the existing components. */
export type WorkspaceMode = 'chat' | 'split' | 'canvas'
export type CompactPane = Exclude<WorkspaceMode, 'split'>
export const WORKSPACE_LAYOUT = {
  minChat: 320,
  minCanvas: 360,
  divider: 1,
  defaultRatio: 0.44,
} as const
export const MIN_SPLIT_WIDTH = WORKSPACE_LAYOUT.minChat + WORKSPACE_LAYOUT.minCanvas + WORKSPACE_LAYOUT.divider

export function canSplitWorkspace(width: number): boolean {
  return Number.isFinite(width) && width >= MIN_SPLIT_WIDTH
}

export function resolveWorkspaceMode(width: number, requested: WorkspaceMode, compact: CompactPane, hasCanvas: boolean): WorkspaceMode {
  if (!hasCanvas) return 'chat'
  if (requested !== 'split') return requested
  return canSplitWorkspace(width) ? 'split' : compact
}

export function activeCanvasProject(canvasProject: string | null, projectId: string): string | null {
  // Opening another project must never pair its conversation with a previous project's canvas.
  return projectId && canvasProject === projectId ? projectId : null
}

export function rememberCanvas(projects: readonly string[], project: string | null): readonly string[] {
  return !project || projects.includes(project) ? projects : [...projects, project]
}

export function chatWidthForRatio(width: number, ratio: number): number {
  if (!canSplitWorkspace(width)) return Math.max(0, Number.isFinite(width) ? width : 0)
  const usable = width - WORKSPACE_LAYOUT.divider
  const desired = usable * (Number.isFinite(ratio) ? ratio : WORKSPACE_LAYOUT.defaultRatio)
  return Math.max(WORKSPACE_LAYOUT.minChat, Math.min(usable - WORKSPACE_LAYOUT.minCanvas, desired))
}

export function ratioForChatWidth(width: number, pixels: number): number {
  if (!canSplitWorkspace(width) || !Number.isFinite(pixels)) return WORKSPACE_LAYOUT.defaultRatio
  return chatWidthForRatio(width, pixels / (width - WORKSPACE_LAYOUT.divider)) / (width - WORKSPACE_LAYOUT.divider)
}
