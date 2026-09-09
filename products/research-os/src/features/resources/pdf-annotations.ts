export type PDFRect={x:number;y:number;width:number;height:number}
export type PDFAnchor={schema:'research.pdf-anchor/v1';kind:'text'|'region'|'page';page:number;rects:PDFRect[];quote:string;context:string}
const prefix='<!-- research-pdf-anchor:'
export function encodeAnnotation(anchor:PDFAnchor,comment:string){return `${prefix}${encodeURIComponent(JSON.stringify(anchor))} -->\n\n${comment}`}
export function decodeAnnotation(body:string):{anchor:PDFAnchor|null;comment:string}{
 const match=body.match(/<!-- research-pdf-anchor:([^\s]+) -->/)
 if(!match)return {anchor:null,comment:body}
 try{const a=JSON.parse(decodeURIComponent(match[1]));if(a.schema!=='research.pdf-anchor/v1'||!['text','region','page'].includes(a.kind)||!Number.isInteger(a.page)||a.page<1||!Array.isArray(a.rects)||typeof a.quote!=='string'||typeof a.context!=='string'||!a.rects.every((r:PDFRect)=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.001&&r.y+r.height<=1.001))throw Error('Invalid anchor');return {anchor:a,comment:body.replace(match[0],'').trim()}}catch{return {anchor:null,comment:body}}
}
export function relativeRect(rect:{left:number;top:number;right:number;bottom:number},page:DOMRect):PDFRect{
 const x=Math.max(0,Math.min(1,(rect.left-page.left)/page.width)),y=Math.max(0,Math.min(1,(rect.top-page.top)/page.height))
 return {x,y,width:Math.max(0,Math.min(1,(rect.right-page.left)/page.width)-x),height:Math.max(0,Math.min(1,(rect.bottom-page.top)/page.height)-y)}
}
export function anchorPrompt(anchor:PDFAnchor,comment:string){return `第 ${anchor.page} 页\n定位方式：${anchor.kind}\n原文：${anchor.quote||'此区域没有可提取文字，请查看对应 PDF 区域。'}\n周边文本：${anchor.context}\nPDF 区域（左上角为原点，坐标为页面宽高的 0–1 比例）：${JSON.stringify(anchor.rects)}\n批注：${comment}\n请打开上述版本的 PDF 查看标记区域，再结合原文定位稿件源码；区域坐标不是 LaTeX 行号，公式和图表布局不能只凭提取文字推断。`}
