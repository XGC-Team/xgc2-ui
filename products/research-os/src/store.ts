import type { ManuscriptPDF } from './features/resources/manuscript'
import type { AcademicNote } from './features/resources/academic-graph'
import { create } from 'zustand'
export const NAV_ITEMS = [
  {id:'chat',label:'Chat',description:'与研究助手对话'},
  {id:'workflow',label:'Workflow',description:'计划、验证与执行'},
  {id:'graph',label:'Graph',description:'学术仓库论文与知识图谱'},
  {id:'knowledge',label:'Knowledge',description:'知识库文件与文档'},
  {id:'settings',label:'Settings',description:'供应者与模型配置'},
] as const
export type NavId = typeof NAV_ITEMS[number]['id']
export const useWorkbench = create<{
  locale:'zh'|'en';setLocale:(locale:'zh'|'en')=>void
  pdf:ManuscriptPDF|null;openPDF:(pdf:ManuscriptPDF)=>void
  rightOpen:boolean;setRightOpen:(open:boolean)=>void
  rightTab:string;setRightTab:(tab:string)=>void
  readingDocument:{workspace:string;path:string;title:string}|null
  openDocument:(document:{workspace:string;path:string;title:string})=>void
  knowledgeScope:string;setKnowledgeScope:(scope:string)=>void
  knowledgeDocuments:AcademicNote[];setKnowledgeDocuments:(notes:AcademicNote[])=>void
  theme: 'light'|'dark'; toggleTheme:()=>void
  activeNav: NavId; setActiveNav:(id:NavId)=>void; openChat:()=>void
  paletteOpen:boolean; setPaletteOpen:(open:boolean)=>void
  projectId:string; setProjectId:(id:string)=>void
}>((set)=>({
  locale:localStorage.getItem('research-ui-locale')==='en'?'en':'zh',setLocale:(locale)=>{localStorage.setItem('research-ui-locale',locale);document.documentElement.lang=locale;set({locale})},
  pdf:null,openPDF:(pdf)=>set({pdf,rightOpen:true,rightTab:'pdf'}),
  rightOpen:true,setRightOpen:(rightOpen)=>set({rightOpen}),
  rightTab:'browser',setRightTab:(rightTab)=>set({rightTab}),
  readingDocument:null,openDocument:(readingDocument)=>set({readingDocument,rightTab:'reading',rightOpen:true}),
  knowledgeScope:'knowledge',setKnowledgeScope:(knowledgeScope)=>set({knowledgeScope}),
  knowledgeDocuments:[],setKnowledgeDocuments:(knowledgeDocuments)=>set({knowledgeDocuments}),
  theme: localStorage.getItem('research-ui-theme') === 'dark' ? 'dark' : 'light',
  toggleTheme:()=>set(s=>{const theme=s.theme==='light'?'dark':'light';localStorage.setItem('research-ui-theme',theme);return {theme}}),
  activeNav:'chat',setActiveNav:(activeNav)=>set({activeNav}),
  openChat:()=>{localStorage.setItem('research-ui-project','');set({activeNav:'chat',projectId:''})},
  paletteOpen:false,setPaletteOpen:(paletteOpen)=>set({paletteOpen}),
  projectId:localStorage.getItem('research-ui-project')||'',setProjectId:(projectId)=>{localStorage.setItem('research-ui-project',projectId);set({projectId})},
}))
