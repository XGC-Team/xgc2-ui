import {forceSimulation,forceManyBody,forceLink,forceX,forceY,forceCollide,type Simulation} from 'd3-force'
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
}

export interface GEdge {
  s: number
  t: number
}

export const GROUPS: {id: GroupId; label: string}[] = [{id:'paper',label:'论文'},{id:'concept',label:'概念'},{id:'project',label:'项目'},{id:'note',label:'笔记'}]
export interface GraphData { nodes: GNode[]; edges: GEdge[]; adj: Map<number, number[]> }
export class ForceSim {
  simulation: Simulation<GNode,undefined>
  running=true
  constructor(data:GraphData){
    this.simulation=forceSimulation(data.nodes).stop().alphaDecay(.035).velocityDecay(.38)
      .force('charge',forceManyBody<GNode>().strength(-170).distanceMin(12))
      .force('links',forceLink<GNode, {source:number;target:number}>(data.edges.map(e=>({source:e.s,target:e.t}))).id(n=>n.id).distance(95).strength(.18))
      .force('collide',forceCollide<GNode>().radius(n=>n.r+12))
      .force('x',forceX<GNode>(0).strength(.015)).force('y',forceY<GNode>(0).strength(.015))
  }
  tick(){if(!this.running)return;this.simulation.tick();if(this.simulation.alpha()<.003)this.running=false}
  reheat(value=.3){this.simulation.alpha(Math.max(this.simulation.alpha(),value));this.running=true}
}
