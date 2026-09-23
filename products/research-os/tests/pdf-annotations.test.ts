import {describe,it,expect} from 'vitest'
import {encodeAnnotation,decodeAnnotation,relativeRect,anchorPrompt,pdfAnnotationRequest} from '../src/features/resources/pdf-annotations'
import { pdfFeedbackAnchor } from '../src/features/workbench/annotation-discussion'
import { originalAssetURL, originalResponseDigest } from '../src/features/resources/original-source'
describe('PDF anchors',()=>{
 it('retains exact text and normalised geometry through storage',()=>{const a={schema:'research.pdf-anchor/v1' as const,kind:'text' as const,page:2,rects:[{x:.1,y:.2,width:.3,height:.04}],quote:'x̄ = 4 < y',context:'equation (1)'};expect(decodeAnnotation(encodeAnnotation(a,'调整公式 --> 间距'))).toEqual({anchor:a,comment:'调整公式 --> 间距'});expect(anchorPrompt(a,'改公式')).toContain('equation (1)')})
 it('rejects invalid and cross-page rectangles',()=>{const body=encodeAnnotation({schema:'research.pdf-anchor/v1',kind:'region',page:1,rects:[{x:.8,y:.1,width:.4,height:.1}],quote:'',context:''},'bad');expect(decodeAnnotation(body).anchor).toBeNull()})
 it('preserves legacy page notes without fabricating positions',()=>{expect(decodeAnnotation('old note')).toEqual({anchor:null,comment:'old note'})})
 it('keeps the same normalized selection when scaled and scrolled',()=>{const a=relativeRect({left:120,top:240,right:180,bottom:280},{left:100,top:200,width:200,height:400} as DOMRect);const b=relativeRect({left:40,top:60,right:160,bottom:140},{left:0,top:-20,width:400,height:800} as DOMRect);expect(a).toEqual(b)})
 it('saves original PDF annotations under the actual project while preserving the distinct source owner and revision',()=>{
  const pdf={origin:'original' as const,workspace:'academic',path:'review/TRO/reviewer.pdf',digest:`sha256:${'a'.repeat(64)}`,url:'blob:local'}
  const anchor={schema:'research.pdf-anchor/v1' as const,kind:'region' as const,page:3,rects:[{x:.1,y:.2,width:.3,height:.2}],quote:'theory concern',context:'review text'}
  const command=pdfAnnotationRequest(pdf,{projectId:'research-project',workspace:'manuscript-files'},anchor,'检查这一处')
  expect(command.path).toBe('/research/threads/research-project/knowledge-items')
  const saved=decodeAnnotation(command.input.body)
  expect(saved.anchor?.pdf).toEqual({origin:'original',workspace:pdf.workspace,path:pdf.path,digest:pdf.digest})
  expect(saved.comment).toBe('检查这一处')
  const feedback=pdfFeedbackAnchor(pdf,anchor)
  expect(feedback).toMatchObject({origin:'external',workspace:'academic',path:pdf.path,digest:pdf.digest,page:3})
  expect(feedback).not.toHaveProperty('buildId')
  expect(command.input.authorRef).toBe(`pdf:academic:${pdf.digest}:3`)
  expect(()=>pdfAnnotationRequest(pdf,{projectId:'',workspace:'academic'},anchor,'text')).toThrow('project')
 })
 it('retains genuine build provenance and rejects an original annotation claiming a build',()=>{
  const anchor={schema:'research.pdf-anchor/v1' as const,kind:'page' as const,page:1,rects:[],quote:'',context:''}
  const command=pdfAnnotationRequest({workspace:'files',path:'main.tex',digest:'pdf-digest',buildId:'real-build',url:'/pdf'},{projectId:'project',workspace:'files'},anchor,'note')
  expect(decodeAnnotation(command.input.body).anchor?.pdf).toMatchObject({origin:'project-build',buildId:'real-build',workspace:'files'})
  const invalid={...anchor,pdf:{origin:'original' as const,workspace:'academic',path:'review.pdf',digest:'revision',buildId:'invented'}}
  expect(decodeAnnotation(encodeAnnotation(invalid,'note')).anchor).toBeNull()
 })
 it('uses the original byte route with a strict response pin instead of a build artifact route',()=>{
  const digest=`sha256:${'b'.repeat(64)}`
  expect(originalAssetURL({workspace:'academic',path:'review/审稿 1.pdf',digest})).toBe(`/api/v1/workspaces/academic/assets/review/%E5%AE%A1%E7%A8%BF%201.pdf?digest=${encodeURIComponent(digest)}`)
  expect(originalResponseDigest(new Response('',{headers:{'X-Content-Digest':digest}}),digest)).toBe(digest)
  expect(()=>originalResponseDigest(new Response('',{headers:{'X-Content-Digest':digest}}),`sha256:${'c'.repeat(64)}`)).toThrow('pinned revision')
  expect(()=>originalResponseDigest(new Response(''))).toThrow('pinned revision')
 })
})
