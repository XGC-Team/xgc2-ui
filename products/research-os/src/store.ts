import type { ManuscriptPDF } from './features/resources/manuscript'
import type { AcademicNote } from './features/resources/academic-graph'
import type { PDFRect } from './features/resources/pdf-annotations'
import { create } from 'zustand'
export const NAV_ITEMS = [
  {id:'chat',label:'Chat',description:'与研究助手对话'},
  {id:'workflow',label:'Workflow',description:'计划、验证与执行'},
  {id:'knowledge',label:'Knowledge',description:'知识库：文件树、阅读与图谱'},
  {id:'settings',label:'Settings',description:'供应者与模型配置'},
] as const
export type NavId = typeof NAV_ITEMS[number]['id']
/* 右栏标签页：每个标签是一个内容实例（网页/文件/PDF/笔记），统一显示语义，不是大类切换 */
export type RightTab =
  | {id:string;kind:'web';title:string;url?:string}
  | {id:string;kind:'file';title:string}
  | {id:string;kind:'pdf';title:string;pdf:ManuscriptPDF}
  | {id:string;kind:'note';title:string;doc?:{workspace:string;path:string;title:string}}
export type RightTabInput =
  | {kind:'web';url?:string} | {kind:'file'}
  | {kind:'pdf';pdf:ManuscriptPDF}
  | {kind:'note';doc?:{workspace:string;path:string;title:string}}
const tabId=()=>`rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`
const tabTitle=(input:RightTabInput)=>{
 if(input.kind==='pdf')return input.pdf.path.split('/').pop()||'PDF'
 if(input.kind==='note')return input.doc?.title??'阅读'
 if(input.kind==='file')return '文件'
 if(input.url){try{return new URL(input.url).host}catch{/* 回落新网页 */}}
 return '新网页'
}
export const useWorkbench = create<{
  locale:'zh'|'en';setLocale:(locale:'zh'|'en')=>void
  openPDF:(pdf:ManuscriptPDF)=>void
  rightOpen:boolean;setRightOpen:(open:boolean)=>void
  rightTabs:RightTab[];activeRightTab:string
  openRightTab:(input:RightTabInput)=>string
  closeRightTab:(id:string)=>void
  activateRightTab:(id:string)=>void
  updateRightTab:(id:string,patch:{title?:string;pdf?:ManuscriptPDF})=>void
  readingDocument:{workspace:string;path:string;title:string}|null
  openDocument:(document:{workspace:string;path:string;title:string})=>void
  /* 源码舞台：PDF 批注跳到 LaTeX 源码时占据中央区，保留下方页面状态 */
  sourceView:{workspace:string;path:string;line:number;buildId:string;pdf:ManuscriptPDF}|null
  openSourceView:(view:{workspace:string;path:string;line:number;buildId:string;pdf:ManuscriptPDF})=>void
  closeSourceView:()=>void
  /* PDF 定位闪烁：源码行/批注回跳时在右栏 PDF 上闪一个框 */
  pdfFlash:{buildId:string;page:number;rects?:PDFRect[];box?:{x:number;y:number;width:number;height:number};nonce:number}|null
  flashPDF:(flash:{buildId:string;page:number;rects?:PDFRect[];box?:{x:number;y:number;width:number;height:number}},pdf?:ManuscriptPDF)=>void
  knowledgeDocuments:AcademicNote[];setKnowledgeDocuments:(notes:AcademicNote[])=>void
  previewDocument:(document:{workspace:string;path:string;title:string})=>void
  closeDocument:()=>void
  theme: 'light'|'dark'; toggleTheme:()=>void
  activeNav: NavId; setActiveNav:(id:NavId)=>void; openChat:()=>void
  /* 思维白板：项目作用域，打开时占据 chat 页主区 */
  canvasProject: string | null; openCanvas:(project:string)=>void; closeCanvas:()=>void
  paletteOpen:boolean; setPaletteOpen:(open:boolean)=>void
  projectId:string; setProjectId:(id:string)=>void
}>((set,get)=>({
  locale:localStorage.getItem('research-ui-locale')==='en'?'en':'zh',setLocale:(locale)=>{localStorage.setItem('research-ui-locale',locale);document.documentElement.lang=locale;set({locale})},
  openPDF:(pdf)=>{get().openRightTab({kind:'pdf',pdf})},
  rightOpen:true,setRightOpen:(rightOpen)=>set({rightOpen}),
  rightTabs:[{id:'rt-initial',kind:'web',title:'新网页'}],activeRightTab:'rt-initial',
  openRightTab:(input)=>{
    const s=get()
    const existing=s.rightTabs.find(t=>
      (input.kind==='pdf'&&t.kind==='pdf'&&t.pdf.buildId===input.pdf.buildId)||
      (input.kind==='note'&&t.kind==='note'&&(input.doc? t.doc?.workspace===input.doc.workspace&&t.doc?.path===input.doc.path : !t.doc))||
      (input.kind==='web'&&input.url&&t.kind==='web'&&t.url===input.url)||
      (input.kind==='file'&&t.kind==='file'))
    if(existing){set({activeRightTab:existing.id,rightOpen:true});return existing.id}
    const tab={...input,id:tabId(),title:tabTitle(input)} as RightTab
    set({rightTabs:[...s.rightTabs,tab],activeRightTab:tab.id,rightOpen:true})
    return tab.id
  },
  closeRightTab:(id)=>set(s=>{
    const i=s.rightTabs.findIndex(t=>t.id===id);if(i<0)return s
    const rightTabs=s.rightTabs.filter(t=>t.id!==id)
    return{rightTabs,activeRightTab:s.activeRightTab===id?(rightTabs[Math.min(i,rightTabs.length-1)]?.id??''):s.activeRightTab}
  }),
  activateRightTab:(id)=>set({activeRightTab:id,rightOpen:true}),
  updateRightTab:(id,patch)=>set(s=>({rightTabs:s.rightTabs.map(t=>t.id===id?{...t,...patch} as RightTab:t)})),
  readingDocument:null,openDocument:(doc)=>{get().openRightTab({kind:'note',doc})},
  sourceView:null,openSourceView:(sourceView)=>set({sourceView}),closeSourceView:()=>set({sourceView:null}),
  pdfFlash:null,
  flashPDF:(flash,pdf)=>{
    const s=get()
    const tab=s.rightTabs.find(t=>t.kind==='pdf'&&t.pdf.buildId===flash.buildId)
    if(tab)set({activeRightTab:tab.id,rightOpen:true})
    else if(pdf)s.openRightTab({kind:'pdf',pdf})
    set({pdfFlash:{...flash,nonce:Date.now()}})
  },
  knowledgeDocuments:[],setKnowledgeDocuments:(knowledgeDocuments)=>set({knowledgeDocuments}),
  previewDocument:(readingDocument)=>set({readingDocument}),
  closeDocument:()=>set({readingDocument:null}),
  theme: localStorage.getItem('research-ui-theme') === 'dark' ? 'dark' : 'light',
  toggleTheme:()=>set(s=>{const theme=s.theme==='light'?'dark':'light';localStorage.setItem('research-ui-theme',theme);return {theme}}),
  activeNav:'chat',setActiveNav:(activeNav)=>set({activeNav}),
  openChat:()=>{localStorage.setItem('research-ui-project','');set({activeNav:'chat',projectId:'',canvasProject:null})},
  canvasProject:null,openCanvas:(project)=>set({canvasProject:project,projectId:project,activeNav:'chat'}),closeCanvas:()=>set({canvasProject:null}),
  paletteOpen:false,setPaletteOpen:(paletteOpen)=>set({paletteOpen}),
  projectId:localStorage.getItem('research-ui-project')||'',setProjectId:(projectId)=>{localStorage.setItem('research-ui-project',projectId);set({projectId})},
}))
