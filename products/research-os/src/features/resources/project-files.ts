export type ProjectEntry={kind:'directory'|'file';path:string;sizeBytes:number}
const excluded=new Set(['source','src','scripts','tools','config','configs','node_modules','vendor','external','build','dist','target','__pycache__','venv','ros1_ws'])
const material=/\.(md|mdx|txt|tex|bib|pdf|csv|tsv|png|jpe?g|svg|webp|gif|eps|docx?|pptx?|xlsx?|odt|zip)$/i
export function isProjectMaterial(entry:ProjectEntry){
 const parts=entry.path.split('/'),name=parts[parts.length-1]
 if(parts.some(part=>part.startsWith('.')||excluded.has(part.toLowerCase()))||name.startsWith('~$'))return false
 return entry.kind==='directory'||(material.test(name)&&! /^(AGENTS|CLAUDE|GEMINI|CONTRIBUTING|LICENSE|CHANGELOG)\b/i.test(name))
}
export const isTextMaterial=(path:string)=>/\.(md|mdx|txt|tex|bib|csv|tsv)$/i.test(path)
