import {describe,expect,it} from 'vitest'
import {attachedPDFRevision,type ReadingRevision} from '../src/features/resources/pdf-note-revisions'
import {encodeAnnotation} from '../src/features/resources/pdf-annotations'
import type {ManuscriptPDF} from '../src/features/resources/manuscript'
const pdf:ManuscriptPDF={workspace:'paper',path:'main.tex',digest:'a'.repeat(64),buildId:'build-a',url:'/pdf'}
const revision=(id:string,at:string,source=pdf):ReadingRevision=>({id,createdAt:at,authorRef:`pdf:${source.workspace}:${source.digest}:1`,body:encodeAnnotation({schema:'research.pdf-anchor/v1',kind:'region',page:1,rects:[{x:.1,y:.2,width:.2,height:.1}],quote:'selected',context:'context',pdf:{...source,origin:'project-build'}},id)})
describe('explicitly attached PDF annotation corrections',()=>{
  it('shows the latest attached correction once and ignores a newer unattached head',()=>{
    const old=revision('old','2026-01-01'),corrected=revision('corrected','2026-01-02'),unattached=revision('unattached','2026-01-03')
    expect(attachedPDFRevision([unattached,old,corrected],new Set(['old','corrected']),pdf)?.id).toBe('corrected')
  })
  it('preserves the original annotation when viewing an older PDF',()=>{
    const old=revision('old','2026-01-01'),nextPDF={...pdf,digest:'b'.repeat(64),buildId:'build-b'},next=revision('new','2026-01-02',nextPDF)
    expect(attachedPDFRevision([old,next],new Set(['old','new']),pdf)?.id).toBe('old')
    expect(attachedPDFRevision([old,next],new Set(['old','new']),nextPDF)?.id).toBe('new')
  })
  it('never imports a foreign project or original-PDF claim through an author reference',()=>{
    const foreign=revision('foreign','2026-01-01',{...pdf,workspace:'other'});foreign.authorRef=`pdf:${pdf.workspace}:${pdf.digest}:1`
    expect(attachedPDFRevision([foreign],new Set(['foreign']),pdf)).toBeUndefined()
    const original={...pdf,origin:'original' as const}
    expect(attachedPDFRevision([revision('built','2026-01-01')],new Set(['built']),original)).toBeUndefined()
  })
})
