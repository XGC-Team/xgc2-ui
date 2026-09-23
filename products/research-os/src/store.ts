import type { Anchor, Scope } from './features/review/review-model'
import { canCloseTab } from './features/projects/tab-close-guards'
import { draftIdFromAnchor, type DraftScope, type DraftIntent, type DraftSource, type DraftKind } from './features/projects/draft-model'
import { CONTEXT_PREFERENCE, restoreContextItems, type ContextItem } from './features/projects/context-model'
import type { ManuscriptPDF } from './features/resources/manuscript'
import type { AcademicNote } from './features/resources/academic-graph'
import type { PDFRect } from './features/resources/pdf-annotations'
import { rememberRecentProject } from './features/workbench/writing-session'
import { backResourceInLayout, activateResourceInLayout, closeResourceInLayout, LAYOUT_PREFERENCE, moveResourceInLayout, openResourceInLayout, restoreResourceLayout, type ContentView, type ResourceInput, type ResourceLayout, type ResourceTab, type SourceLocation, type WorkArea } from './features/workbench/resource-model'
import { readPreference, writePreference } from './lib/storage'
import { create } from 'zustand'
import {restorePendingIntents,persistPendingChanges,type PendingIntents} from './features/workbench/pending-intents'
const restoredPending=(()=>{try{return restorePendingIntents(localStorage)}catch{return {intents:{reviewIntents:[],draftIntents:[],canvasReferences:[]} as PendingIntents,error:''}}})()
export const NAV_ITEMS = [
  {id:'chat',label:'Chat',description:'与研究助手对话'},
  {id:'workflow',label:'Workflow',description:'计划、验证与执行'},
  {id:'knowledge',label:'Knowledge',description:'知识库：文件树、阅读与图谱'},
  {id:'settings',label:'Settings',description:'供应者与模型配置'},
] as const
export type NavId = typeof NAV_ITEMS[number]['id']
export type SettingsSection = 'appearance' | 'connections'
export type ReviewIntent = { id: string; scope: Scope; anchor: Anchor; body: string; at: string; designDiscussion?: true; annotationId?: string }
const persistLayout = (resourceLayout: ResourceLayout) => {
  writePreference(LAYOUT_PREFERENCE, JSON.stringify(resourceLayout))
  return { resourceLayout }
}
export const useWorkbench = create<{
  pendingPersistenceError:string
  reviewFocus: {scope:Scope;anchor:Anchor;nonce:string}|null
  reviewScopes:Record<string,Scope>
  setReviewFocus: (scope:Scope,anchor:Anchor)=>void
  reviewIntents: ReviewIntent[]
  requestReviewFeedback: (intent: ReviewIntent) => void
  consumeReviewFeedback: (id: string) => void
  draftIntents: DraftIntent[]
  requestDraftCapture: (intent: DraftIntent) => void
  consumeDraftIntent: (id: string) => void
  draftSelection: { scope: DraftScope; id: string; nonce: number; kind?: DraftKind } | null
  selectResearchDraft: (scope: DraftScope, id: string, kind?: DraftKind) => void
  readingAnchor: (DraftSource & { nonce: number }) | null
  setReadingAnchor: (source: DraftSource) => void
  canvasReferences: { id: string; project: string; draftId: string; title: string }[]
  requestCanvasReference: (project: string, draftId: string, title: string) => void
  consumeCanvasReference: (id: string) => void
  /* 可见的 Chat 上下文集合：加入 ≠ 发送；项目切换不清空，作用域在发送前检查 */
  contextItems: ContextItem[]
  addContextItem: (item: ContextItem) => void
  removeContextItem: (id: string) => void
  patchContextItem: (id: string, patch: Partial<ContextItem>) => void

  locale:'zh'|'en';setLocale:(locale:'zh'|'en')=>void
  openPDF:(pdf:ManuscriptPDF)=>void
  secondaryOpen:boolean;setSecondaryOpen:(open:boolean)=>void
  resourceLayout:ResourceLayout
  openResource:(input:ResourceInput,area?:WorkArea)=>string
  closeResource:(id:string)=>void
  activateResource:(id:string)=>void
  moveResource:(id:string,area:WorkArea)=>void
  backResource:(area:WorkArea)=>void
  updateResource:(id:string,patch:{title?:string;pdf?:ManuscriptPDF;view?:ContentView;followCurrent?:boolean;digest?:string})=>void
  showConversation:()=>void
  readingDocument:{workspace:string;path:string;title:string}|null
  openDocument:(document:{workspace:string;path:string;title:string})=>void
  openSourceView:(view:SourceLocation)=>void
  /* PDF 定位闪烁：源码行/批注回跳时在右栏 PDF 上闪一个框 */
  pdfFlash:{buildId:string;page:number;rects?:PDFRect[];box?:{x:number;y:number;width:number;height:number};nonce:number}|null
  flashPDF:(flash:{buildId:string;page:number;rects?:PDFRect[];box?:{x:number;y:number;width:number;height:number}},pdf?:ManuscriptPDF)=>void
  knowledgeDocuments:AcademicNote[];setKnowledgeDocuments:(notes:AcademicNote[])=>void
  previewDocument:(document:{workspace:string;path:string;title:string})=>void
  closeDocument:()=>void
  theme: 'light'|'dark'; toggleTheme:()=>void
  activeNav: NavId; setActiveNav:(id:NavId)=>void; openChat:()=>void
  chatSurface:'home'|'generic'|'writing'
  reviewDockOpen:boolean; setReviewDockOpen:(open:boolean)=>void
  enterWritingProject:(id:string)=>void
  openCanvas:(project:string)=>void
  paletteOpen:boolean; setPaletteOpen:(open:boolean)=>void
  projectId:string; setProjectId:(id:string)=>void
  /* 设置页深链：侧栏/名册/命令面板跳到某一节（外观、连接与模型） */
  settingsFocus:{section:SettingsSection;nonce:number}|null; openSettings:(section?:SettingsSection)=>void
  /* 讨论停靠：Chat 固定为主区左侧一列，主区与并排区同时承载画布与制品——Chat | 画布 | 制品 三栏同时可用 */
  chatDock:boolean; setChatDock:(docked:boolean)=>void
}>((set,get)=>({
  pendingPersistenceError:restoredPending.error,
  reviewScopes:Object.fromEntries(restoredPending.intents.reviewIntents.map(item=>[item.scope.projectId,{...item.scope}])),
  reviewFocus:null, setReviewFocus:(scope,anchor)=>set(s=>({reviewScopes:{...s.reviewScopes,[scope.projectId]:{...scope}},reviewFocus:{scope:{...scope},anchor:structuredClone(anchor),nonce:crypto.randomUUID()}})),
  reviewIntents: restoredPending.intents.reviewIntents,
  requestReviewFeedback: intent => {
    const copy = structuredClone(intent)
    set(s => ({reviewScopes:{...s.reviewScopes,[copy.scope.projectId]:{...copy.scope}},reviewIntents:s.reviewIntents.some(i=>i.id===copy.id)?s.reviewIntents:[...s.reviewIntents,copy],reviewDockOpen:true,activeNav:'chat'}))
  },
  consumeReviewFeedback: id => set(s=>({reviewIntents:s.reviewIntents.filter(i=>i.id!==id)})),
  draftIntents: restoredPending.intents.draftIntents,
  requestDraftCapture: (intent) => {
    intent = { ...intent, scope: { ...intent.scope }, source: { ...intent.source } }
    set(s => ({ draftIntents: s.draftIntents.some(item => item.id === intent.id) ? s.draftIntents : [...s.draftIntents, intent] }))
    get().openResource({ kind: 'drafts', scope: intent.scope })
  },
  consumeDraftIntent: (id) => set(s => ({ draftIntents: s.draftIntents.filter(item => item.id !== id) })),
  draftSelection: null,
  selectResearchDraft: (scope, id, kind) => {
    get().openResource({ kind: 'drafts', scope })
    set({ draftSelection: { scope: { ...scope }, id, kind, nonce: Date.now() } })
  },
  readingAnchor: null, setReadingAnchor: source => set({ readingAnchor: { ...source, nonce: Date.now() } }),
  canvasReferences: restoredPending.intents.canvasReferences,
  requestCanvasReference: (project, draftId, title) => {
    const id = `${project}:${draftId}`
    set(s => ({ canvasReferences: s.canvasReferences.some(item => item.id === id) ? s.canvasReferences : [...s.canvasReferences, { id, project, draftId, title }] }))
    get().openCanvas(project)
  },
  consumeCanvasReference: id => set(s => ({ canvasReferences: s.canvasReferences.filter(item => item.id !== id) })),
  contextItems: restoreContextItems(readPreference(CONTEXT_PREFERENCE)),
  addContextItem: item => set(s => ({
    contextItems: s.contextItems.some(existing => existing.project === item.project && existing.kind === item.kind && existing.ref === item.ref)
      ? s.contextItems.map(existing => existing.project === item.project && existing.kind === item.kind && existing.ref === item.ref ? { ...item, id: existing.id } : existing)
      : [...s.contextItems, { ...item, source: item.source ? { ...item.source } : undefined }],
  })),
  removeContextItem: id => set(s => ({ contextItems: s.contextItems.filter(item => item.id !== id) })),
  patchContextItem: (id, patch) => set(s => ({ contextItems: s.contextItems.map(item => item.id === id ? { ...item, ...patch, id: item.id } : item) })),

  locale:readPreference('research-ui-locale')==='en'?'en':'zh',setLocale:(locale)=>{writePreference('research-ui-locale',locale);document.documentElement.lang=locale;set({locale})},
  openPDF:(pdf)=>{get().openResource({kind:'pdf',pdf,followCurrent:false})},
  secondaryOpen:readPreference('research-ui-secondary')!=='collapsed',
  setSecondaryOpen:(secondaryOpen)=>{writePreference('research-ui-secondary',secondaryOpen?'open':'collapsed');set({secondaryOpen})},
  resourceLayout:restoreResourceLayout(readPreference(LAYOUT_PREFERENCE)),
  openResource:(input,area)=>{
    const s=get()
    if(input.kind==='file'&&input.target){
      const id=draftIdFromAnchor(input.target.path)
      if(id){
        const scope={projectId:input.target.projectId,workspace:input.target.workspace}
        const tab=s.openResource({kind:'drafts',scope},area)
        set({draftSelection:{scope,id,nonce:Date.now()}})
        return tab
      }
    }
    const destination=area??(['chat','research','source'].includes(input.kind)?'primary':'secondary')
    const {layout,id}=openResourceInLayout(s.resourceLayout,input,s.projectId,destination,s.locale)
    set({...persistLayout(layout),activeNav:'chat',secondaryOpen:layout.tabs.find(t=>t.id===id)?.area==='secondary'||s.secondaryOpen})
    return id
  },
  closeResource:(id)=>{
    if(!get().resourceLayout.tabs.some(tab=>tab.id===id))return
    if(!canCloseTab(id)){get().activateResource(id);return}
    set(s=>persistLayout(closeResourceInLayout(s.resourceLayout,id)))
  },
  activateResource:(id)=>{
    const tab=get().resourceLayout.tabs.find(t=>t.id===id)
    if(!tab)return
    get().setProjectId(tab.projectId)
    set(s=>({...persistLayout(activateResourceInLayout(s.resourceLayout,id)),activeNav:'chat',secondaryOpen:tab.area==='secondary'||s.secondaryOpen}))
  },
  backResource:(area)=>set(s=>persistLayout(backResourceInLayout(s.resourceLayout,s.projectId,area))),
  moveResource:(id,area)=>set(s=>({...persistLayout(moveResourceInLayout(s.resourceLayout,id,area)),secondaryOpen:area==='secondary'||s.secondaryOpen})),
  updateResource:(id,patch)=>set(s=>persistLayout({...s.resourceLayout,tabs:s.resourceLayout.tabs.map(t=>t.id===id?{...t,...patch} as ResourceTab:t)})),
  showConversation:()=>{
    // Docked discussion is always visible beside the primary area; revealing it must not blank the primary tab.
    const s=get()
    if(s.chatDock){
      if(!s.resourceLayout.tabs.some(t=>t.projectId===s.projectId&&t.kind==='chat')){const content=s.resourceLayout.active[s.projectId]?.primary;s.openResource({kind:'chat'},'primary');if(content)get().activateResource(content)}
      set({activeNav:'chat'});return
    }
    s.openResource({kind:'chat'},'primary')
  },
  readingDocument:null,openDocument:(doc)=>{get().openResource({kind:'note',doc})},
  openSourceView:(source)=>{get().openResource({kind:'source',source},'primary')},
  pdfFlash:null,
  flashPDF:(flash,pdf)=>{
    const s=get()
    const tab=s.resourceLayout.tabs.find(t=>t.projectId===s.projectId&&t.kind==='pdf'&&t.pdf.buildId===flash.buildId)
    if(tab)s.activateResource(tab.id)
    else if(pdf)s.openResource({kind:'pdf',pdf})
    set({pdfFlash:{...flash,nonce:Date.now()}})
  },
  knowledgeDocuments:[],setKnowledgeDocuments:(knowledgeDocuments)=>set({knowledgeDocuments}),
  previewDocument:(readingDocument)=>set({readingDocument}),
  closeDocument:()=>set({readingDocument:null}),
  theme: readPreference('research-ui-theme') === 'dark' ? 'dark' : 'light',
  toggleTheme:()=>set(s=>{const theme=s.theme==='light'?'dark':'light';writePreference('research-ui-theme',theme);return {theme}}),
  activeNav:(NAV_ITEMS.some(item=>item.id===readPreference('research-ui-nav'))?readPreference('research-ui-nav'):'chat') as NavId,setActiveNav:(activeNav)=>set({activeNav}),
  openChat:()=>{writePreference('research-ui-project','');set({activeNav:'chat',projectId:'',chatSurface:'generic',reviewDockOpen:false});get().showConversation()},
  chatSurface:readPreference('research-ui-project')?'writing':'home',
  reviewDockOpen:false,setReviewDockOpen:(reviewDockOpen)=>set({reviewDockOpen}),
  enterWritingProject:(id)=>{
    if(!id.trim())return
    rememberRecentProject(id)
    writePreference('research-ui-project',id)
    const s=get()
    const hasPrimary=s.resourceLayout.tabs.some(tab=>tab.projectId===id&&tab.area==='primary')
    set({projectId:id,activeNav:'chat',chatSurface:'writing',reviewDockOpen:s.projectId===id?s.reviewDockOpen:false})
    if(!hasPrimary)get().showConversation()
  },
  openCanvas:(project)=>{get().enterWritingProject(project);get().openResource({kind:'research',workspace:project,view:'canvas'},'primary')},
  paletteOpen:false,setPaletteOpen:(paletteOpen)=>set({paletteOpen}),
  settingsFocus:null,openSettings:(section='connections')=>set({activeNav:'settings',settingsFocus:{section,nonce:Date.now()}}),
  chatDock:readPreference('research-ui-chat-dock')==='docked',
  setChatDock:(chatDock)=>{
    writePreference('research-ui-chat-dock',chatDock?'docked':'tabbed')
    const s=get(),chat=s.resourceLayout.tabs.find(t=>t.projectId===s.projectId&&t.kind==='chat')
    // Docking moves the one keyed conversation into its own column; the primary area falls back to its last content tab.
    if(chatDock&&chat&&s.resourceLayout.active[s.projectId]?.[chat.area]===chat.id){
      const fallback=s.resourceLayout.tabs.filter(t=>t.projectId===s.projectId&&t.area===chat.area&&t.id!==chat.id).at(-1)
      if(fallback)s.activateResource(fallback.id)
    }
    set({chatDock,activeNav:'chat'})
  },
  projectId:readPreference('research-ui-project')||'',setProjectId:(projectId)=>{writePreference('research-ui-project',projectId);if(projectId.trim())rememberRecentProject(projectId);set({projectId,chatSurface:projectId.trim()?'writing':'home'})},
}))

useWorkbench.subscribe((state, previous) => {
  if(state.reviewIntents!==previous.reviewIntents||state.draftIntents!==previous.draftIntents||state.canvasReferences!==previous.canvasReferences){
    let error=''
    try{error=persistPendingChanges(localStorage,previous,state)}catch{error='Pending work could not be saved in browser storage.'}
    if(error!==state.pendingPersistenceError)useWorkbench.setState({pendingPersistenceError:error})
  }
  if(state.activeNav!==previous.activeNav)writePreference('research-ui-nav',state.activeNav)
  if(state.secondaryOpen!==previous.secondaryOpen)writePreference('research-ui-secondary',state.secondaryOpen?'open':'collapsed')
  if(state.contextItems!==previous.contextItems)writePreference(CONTEXT_PREFERENCE,JSON.stringify(state.contextItems))
})
