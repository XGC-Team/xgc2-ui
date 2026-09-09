import {post,request} from '../../lib/api'
export type ManuscriptPDF={workspace:string;path:string;buildId:string;digest:string;url:string}
type BuildRecord={task:{workspaceRef:string;entryPoint:string};manifest:{buildId:string;completedAt:string;status:string;diagnostics:{message:string}[];outputs:{digest:string;mediaType:string}[]}}
export async function listPDFVersions(workspace:string,path:string|undefined,signal?:AbortSignal):Promise<(ManuscriptPDF&{completedAt:string})[]>{
 const records=await request<BuildRecord[]>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(workspace)}`,{signal})
 return records.filter(r=>r.task.workspaceRef===workspace&&(!path||r.task.entryPoint===path)&&r.manifest.status==='succeeded').sort((a,b)=>b.manifest.completedAt.localeCompare(a.manifest.completedAt)).flatMap(record=>{
  const output=record.manifest.outputs.find(o=>o.mediaType==='application/pdf')
  return output?[{workspace,path:record.task.entryPoint,buildId:record.manifest.buildId,digest:output.digest,url:`/api/v1/manuscripts/build-records/${encodeURIComponent(record.manifest.buildId)}/artifacts/${output.digest}`,completedAt:record.manifest.completedAt}]:[]
 })
}
export async function latestPDF(workspace:string,path:string):Promise<ManuscriptPDF|null>{return (await listPDFVersions(workspace,path))[0]||null}
export async function compilePDF(workspace:string,path:string,digest:string):Promise<ManuscriptPDF>{
 const [status,capabilities]=await Promise.all([request<{head:string;entries:unknown[]}>(`/workspaces/${workspace}/git/status`),request<{latex:{available:boolean;detail:string};toolchain:unknown}>('/capabilities')])
 if(status.entries.length)throw Error('请先提交工作区修改，再编译这个版本。')
 if(!capabilities.latex.available||!capabilities.toolchain)throw Error('LaTeX 编译器尚未就绪。')
 if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw Error('源文件版本无效，请重新打开。')
 const manifest=await post<BuildRecord['manifest']>('/manuscripts/builds',{schemaVersion:'xgc.research.manuscript/v1',taskId:`build-${crypto.randomUUID()}`,manuscriptId:workspace,workspaceRef:workspace,gitCommit:status.head,entryPoint:path,inputs:[{path,digest:digest.slice(7)}],toolchain:capabilities.toolchain,requestedAt:new Date().toISOString(),requestedBy:'researcher'})
 if(manifest.status!=='succeeded')throw Error(manifest.diagnostics?.map(d=>d.message).join('\n')||'编译失败，请检查稿件。')
 const output=manifest.outputs.find(o=>o.mediaType==='application/pdf');if(!output)throw Error('构建没有生成 PDF。')
 return {workspace,path,buildId:manifest.buildId,digest:output.digest,url:`/api/v1/manuscripts/build-records/${encodeURIComponent(manifest.buildId)}/artifacts/${output.digest}`}
}
