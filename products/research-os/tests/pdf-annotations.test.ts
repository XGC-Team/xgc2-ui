import {describe,it,expect} from 'vitest'
import {encodeAnnotation,decodeAnnotation,relativeRect,anchorPrompt} from '../src/features/resources/pdf-annotations'
describe('PDF anchors',()=>{
 it('retains exact text and normalised geometry through storage',()=>{const a={schema:'research.pdf-anchor/v1' as const,kind:'text' as const,page:2,rects:[{x:.1,y:.2,width:.3,height:.04}],quote:'x̄ = 4 < y',context:'equation (1)'};expect(decodeAnnotation(encodeAnnotation(a,'调整公式 --> 间距'))).toEqual({anchor:a,comment:'调整公式 --> 间距'});expect(anchorPrompt(a,'改公式')).toContain('equation (1)')})
 it('rejects invalid and cross-page rectangles',()=>{const body=encodeAnnotation({schema:'research.pdf-anchor/v1',kind:'region',page:1,rects:[{x:.8,y:.1,width:.4,height:.1}],quote:'',context:''},'bad');expect(decodeAnnotation(body).anchor).toBeNull()})
 it('preserves legacy page notes without fabricating positions',()=>{expect(decodeAnnotation('old note')).toEqual({anchor:null,comment:'old note'})})
 it('keeps the same normalized selection when scaled and scrolled',()=>{const a=relativeRect({left:120,top:240,right:180,bottom:280},{left:100,top:200,width:200,height:400} as DOMRect);const b=relativeRect({left:40,top:60,right:160,bottom:140},{left:0,top:-20,width:400,height:800} as DOMRect);expect(a).toEqual(b)})
})
