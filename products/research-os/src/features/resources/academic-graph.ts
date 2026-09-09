import { request } from '../../lib/api'
import type { GraphData, GroupId } from '../../lib/graph'
export type AcademicNote = {path:string; content?:string; digest:string; title:string; links?:{target:string;wiki:boolean}[]}
export function noteTitle(path:string,content:string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.split('/').pop()!.replace(/\.md$/i,'')
}
export async function loadAcademicNotes(signal:AbortSignal,scope='knowledge'):Promise<AcademicNote[]> {
  return request<AcademicNote[]>(`/workspaces/academic/knowledge-graph?scope=${scope}`,{signal})
}
function normalize(path:string){const parts:string[]=[];for(const part of path.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part)}return parts.join('/')}
export function academicGraph(notes:AcademicNote[]):GraphData {
  const byPath=new Map(notes.map((n,i)=>[n.path,i]));const byName=new Map<string,number[]>()
  notes.forEach((n,i)=>{const name=n.path.split('/').pop()!.replace(/\.md$/i,'');byName.set(name,[...(byName.get(name)||[]),i])})
  const edges:GraphData['edges']=[];const seen=new Set<string>();const adj=new Map<number,number[]>()
  notes.forEach((n,s)=>{
    const prose=(n.content||'').replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm,'').replace(/`[^`\n]*`/g,'')
    const links=[...prose.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map(m=>({target:m[1],wiki:true}))
    links.push(...[...prose.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(m=>({target:m[1],wiki:false})))
    for(const link of n.links||links){let target:string;try{target=decodeURIComponent(link.target.split('#')[0])}catch{continue}if(!target||/^[a-z]+:|^\//i.test(target))continue
      if(!target.endsWith('.md')){if(!link.wiki)continue;target+='.md'}
      let t=byPath.get(normalize(n.path.slice(0,n.path.lastIndexOf('/')+1)+target))
      if(t===undefined&&link.wiki)t=byPath.get(target)??byPath.get('memory/'+target)
      if(t===undefined&&link.wiki){const matches=byName.get(target.replace(/\.md$/i,''));if(matches?.length===1)t=matches[0]}
      if(t===undefined||s===t)continue
      const key=[Math.min(s,t),Math.max(s,t)].join(':');if(seen.has(key))continue;seen.add(key);edges.push({s,t});adj.set(s,[...(adj.get(s)||[]),t]);adj.set(t,[...(adj.get(t)||[]),s])
    }
  })
  return {edges,adj,nodes:notes.map((n,id)=>{const degree=adj.get(id)?.length||0;const name=n.path.split('/').pop()!;const group:GroupId=name.startsWith('paper-')?'project':name.startsWith('lit-')||name.includes('monograph')?'paper':n.path.includes('/ontology/')?'concept':'note';const angle=id*2.39996323,radius=45*Math.sqrt(id+1);return {id,label:n.title,group,degree,hub:degree>=8,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,vx:0,vy:0,r:Math.min(10,3+Math.sqrt(degree)),mass:1}})}
}
