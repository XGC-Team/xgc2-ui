/* ---------- Obsidian 风格大规模知识图谱引擎 ---------- */

export type GroupId =
  | 'paper'
  | 'concept'
  | 'author'
  | 'org'
  | 'project'
  | 'note'
  | 'dataset'
  | 'agent'

export interface GNode {
  id: number
  label: string
  group: GroupId
  hub?: boolean
  x: number
  y: number
  vx: number
  vy: number
  r: number
  mass: number
  degree: number
  fx?: number | null
  fy?: number | null
  sx?: number
  sy?: number
  unresolved?: boolean
  resourceId?: string
  path?: string
  kind?: string
  /** Folder cluster index (seeded by graph-layout-seed). */
  cluster?: number
}

export interface GEdge {
  resourceId?: string
  sourceRevision?: string
  anchor?: string
  targetHint?: string
  s: number
  t: number
  self?: boolean
  directed?: boolean
  kind?: string
  resolved?: boolean
}

export const GROUPS: {id: GroupId; label: string}[] = [{id:'paper',label:'论文'},{id:'concept',label:'概念'},{id:'project',label:'项目'},{id:'note',label:'笔记'}]
export interface GraphData { nodes: GNode[]; edges: GEdge[]; adj: Map<number, number[]>; complete?: boolean; snapshot?: string }
