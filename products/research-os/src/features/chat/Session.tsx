// Research session scope, idempotency and event identity adapted from the existing Research OS session provider.
import { useWorkbench } from '../../store'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useNativeStream, type NativeComposerSelection, type NativeSettings } from '@xgc2/native-agent/react'
import '@xgc2/native-agent/styles.css'
import type { NativeAnswer, NativeProfile, NativeSession, NativeTurnOptions, Scope } from '@xgc2/native-agent/state'
import { listWorkspaces, type WorkspaceSummary } from '../../lib/api'
import {
  answerNativeRequest, cancelNativeTurn, createNativeSession,
  nativeClient, getNativeSettings, getNativeProfiles, getNativeSessions, reconnectNativeSession, sendNativePrompt,
} from './client'

export function promoteNativeDraft(drafts: Record<string, string>, source: string, sessionId: string): Record<string, string> {
  if (!drafts[source]) return drafts
  const next = { ...drafts, [sessionId]: [drafts[sessionId], drafts[source]].filter(Boolean).join('\n\n') }
  delete next[source]
  return next
}

export function belongsToResearchScope(scope: Scope, projectId: string, workspaceId: string, engineering: boolean): boolean {
  if (scope.context.kind === 'research-repository') return scope.context.id === projectId && scope.workspace.id === projectId
  if (scope.context.kind === (projectId ? 'research-project-discussion' : 'research-discussion')) return scope.context.id === (projectId || 'personal')
  return engineering && (projectId ? scope.context.kind === 'research-project' && scope.context.id === projectId : scope.context.kind === 'research-workspace' && scope.context.id === workspaceId)
}

type NativeAgentSessionValue = {
  appendDraft: (text: string, targetProject?: string) => void
  setDraft: (text: string) => void
  newThread: () => void
  startAndSend: (text: string) => Promise<void>
  updateThread: (id:string, update:{title?:string;archived?:boolean}) => Promise<void>
  settings: NativeSettings | null
  engineering: boolean
  setEngineering: (value: boolean) => void
  busy: boolean
  connection: string
  disconnectReason: string
  connectionProvider: NativeSettings['providers'][number] | undefined
  consent: boolean
  create: (event: FormEvent) => void
  createOptions: NativeTurnOptions
  currentProvider: NativeSettings['providers'][number] | undefined
  draft: string
  error: string
  externalWorkspace: boolean
  interrupt: () => Promise<void>
  openSession: (id: string) => Promise<void>
  operation: (action: () => Promise<unknown>) => Promise<void>
  profileId: string
  profiles: NativeProfile[]
  projectId: string
  prompting: ReadonlySet<string>
  reload: number
  requireCurrentSession: (allowStreamError?: boolean) => {
    busy: boolean
    prompting: ReadonlySet<string>
    selectedId: string
    session: NativeSession
    state: ReturnType<typeof useNativeStream>['state']
    streamError: string
    turnSelection: NativeComposerSelection
  }
  respond: (requestId: string, answer: NativeAnswer) => Promise<void>
  selectedId: string
  selectedProfile: NativeProfile | undefined
  send: (text: string) => Promise<void>
  session: NativeSession | undefined
  sessions: NativeSession[]
  allSessions: NativeSession[]
  selectProjectThread:(project:string,id:string)=>void
  setConsent: (value: boolean) => void
  setCreateOptions: (value: NativeTurnOptions) => void
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>
  setProfileId: (id: string) => void
  setRefresh: Dispatch<SetStateAction<number>>
  setReload: Dispatch<SetStateAction<number>>
  setSelectedId: (id: string) => void
  setSelections: Dispatch<SetStateAction<Record<string, NativeComposerSelection>>>
  setWorkspaceId: (id: string) => void
  settingsError: string
  state: ReturnType<typeof useNativeStream>['state']
  streamError: string
  streamMatchesSelection: boolean
  turnSelection: NativeComposerSelection
  workspaces: WorkspaceSummary[]
  workspaceId: string
}

const NativeAgentSessionContext = createContext<NativeAgentSessionValue | null>(null)

export function useNativeAgentSession(): NativeAgentSessionValue {
  const value = useContext(NativeAgentSessionContext)
  if (!value) throw new Error('原生会话必须放在工作台会话上下文里。')
  return value
}

export function NativeAgentSessionProvider({ children, researchProjectId = '' }: { children: ReactNode; researchProjectId?: string }) {
  const [settings, setSettings] = useState<NativeSettings | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [createOptions, setCreateOptions] = useState<NativeTurnOptions>({})
  const [selections, setSelections] = useState<Record<string, NativeComposerSelection>>({})
  const [profiles, setProfiles] = useState<NativeProfile[]>([])
  const [sessions, setSessions] = useState<NativeSession[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [profileId, setProfileId] = useState('')
  const projectId = researchProjectId
  const requestedThread=useRef<{project:string;id:string}|null>(null)
  const currentProject = useRef(projectId)
  currentProject.current = projectId
  const [engineering, setEngineering] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [reload, setReload] = useState(0)
  const [prompting, setPrompting] = useState<ReadonlySet<string>>(() => new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const starting = useRef(false)
  const pendingFirst = useRef<{id:string;text:string}|null>(null)
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const promptAttempts = useRef(new Map<string, { key: string; inFlight?: Promise<unknown> }>())
  const externalWorkspace = workspaces.some((workspace) => workspace.workspaceId === workspaceId && workspace.source === 'external')
  const scopedSessions = sessions.filter(item => belongsToResearchScope(item.scope, projectId, workspaceId, engineering))
  const session = scopedSessions.find(({ id }) => id === selectedId)
  const [disconnectDetail,setDisconnectDetail]=useState({sessionId:'',text:''})
  const openStream=useCallback<NonNullable<Parameters<typeof useNativeStream>[2]['openStream']>>(options=>{
    const stream=new EventSource(options.url)
    stream.addEventListener('native-agent',message=>{try{const event=JSON.parse(message.data);options.onEvent(event);if(event.kind==='session.state')setDisconnectDetail({sessionId:event.sessionId,text:event.status==='disconnected'?event.text||'':''})}catch(cause){options.onInvalid(cause)}})
    stream.onopen=options.onOpen;stream.onerror=options.onError;return stream
  },[])
  const disconnectReason=disconnectDetail.sessionId===session?.id?disconnectDetail.text:''
  const { state, connection, error: streamError } = useNativeStream(session, reload, { basePath: '/api/v1/native-agents',openStream })
  const selectedProfile = profiles.find(({ id }) => id === (session?.scope.profileId ?? profileId))
  const scopeDraftKey = `scope:${JSON.stringify([projectId, engineering, engineering ? workspaceId : ''])}`
  const draftKey = session?.id ?? scopeDraftKey
  const draft = drafts[draftKey] ?? ''
  const appendDraft = (text: string, targetProject?: string) => {const key=targetProject===undefined||targetProject===projectId?draftKey:`scope:${JSON.stringify([targetProject,false,''])}`;setDrafts(current => ({ ...current, [key]: [current[key], text].filter(Boolean).join('\n\n') }))}
  const turnSelection: NativeComposerSelection = selections[selectedId] ?? { profileId: session?.scope.profileId ?? '', ...(session?.options ?? session?.scope.options) }
  const currentProvider = settings?.providers.find(provider => provider.id === session?.scope.profileId)
  const connectionProvider = settings?.providers.find(provider => provider.id === profileId)
  const streamMatchesSelection = Boolean(session && state.sessionId === selectedId && state.provider === session.provider)
  const currentSelection = useRef({ selectedId, session, state, streamError, busy, turnSelection, prompting })
  currentSelection.current = { selectedId, session, state, streamError, busy, turnSelection, prompting }

  const requireCurrentSession = (allowStreamError = false) => {
    const current = currentSelection.current
    if (!session || current.selectedId !== session.id || current.session?.id !== session.id || current.session.provider !== session.provider
      || current.state.sessionId !== session.id || current.state.provider !== session.provider
      || (current.streamError && !allowStreamError)) throw new Error('当前会话与原生事件记录尚未同步，请重新读取会话记录。')
    return { ...current, session }
  }

  useEffect(() => { setSelectedId(requestedThread.current?.project===researchProjectId?requestedThread.current.id:'');requestedThread.current=null }, [researchProjectId])
  useEffect(() => {
    setSelectedId(current => scopedSessions.some(item => item.id === current) ? current : '')
  }, [sessions, projectId, workspaceId, engineering])

  useEffect(() => {
    const controller = new AbortController()
    void getNativeSettings(controller.signal).then(async settings => {
      if (!controller.signal.aborted) { setSettings(settings); setSettingsError('') }
      for(const provider of settings.providers.filter(p=>p.enabled&&p.available&&!p.models.length)) {
        if(controller.signal.aborted)return
        try {const refreshed=await nativeClient.refreshNativeSettings(provider.id);if(!controller.signal.aborted)setSettings(refreshed)}
        catch(cause){if(!controller.signal.aborted)setSettingsError(describe(cause))}
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setSettingsError(describe(cause)) })
    void listWorkspaces(controller.signal).then(workspaces => { if (!controller.signal.aborted) setWorkspaces(workspaces) }).catch(() => { /* Discussions do not depend on engineering workspace availability. */ })
    void Promise.all([getNativeProfiles(controller.signal), getNativeSessions(controller.signal)])
      .then(([profiles, sessions]) => {
        if (controller.signal.aborted) return
        setProfiles(profiles); setSessions(sessions)
        setProfileId(current => current || profiles.find(profile => profile.available)?.id || '')
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(describe(cause)) })
    return () => controller.abort()
  }, [refresh])

  const openSession = async (id: string) => {
    const requestedProject = projectId
    const available = await getNativeSessions()
    if (currentProject.current !== requestedProject) throw new Error('研究空间已切换，请在当前项目中重新打开执行记录。')
    const target = available.find(item => item.id === id)
    if (!target || !belongsToResearchScope(target.scope, requestedProject, target.scope.workspace.id, true)) throw new Error('这条执行记录不属于当前研究空间。')
    const isEngineering = ['research-project', 'research-workspace'].includes(target.scope.context.kind)
    setSessions(available)
    setEngineering(isEngineering)
    setWorkspaceId(isEngineering ? target.scope.workspace.id : '')
    setSelectedId(id)
    setConsent(false)
    setReload(current => current + 1)
  }

  const operation = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action() } catch (cause) { setError(describe(cause)) } finally { setBusy(false) }
  }
  const createThread = async () => {
    let binding: Pick<Scope, 'context' | 'workspace'>
    if (projectId.startsWith('paper-')) {
      binding = {context:{kind:'research-repository',id:projectId},workspace:{id:projectId,revision:'working-tree'}}
    } else {
      const response = await fetch(`/api/v1/native-agents/discussion-context?projectId=${encodeURIComponent(projectId)}`)
      if (!response.ok) throw new Error('研究空间未能读取。')
      binding = await response.json()
    }
    const scope: Scope = {profileId,...binding,nativeAccessConfirmed:true,...(Object.keys(createOptions).length?{options:createOptions}:{})}
    const fingerprint=JSON.stringify(scope)
    if(createAttempt.current?.fingerprint!==fingerprint)createAttempt.current={fingerprint,key:crypto.randomUUID()}
    const next=await createNativeSession(scope,createAttempt.current.key)
    setSessions(current=>[next,...current.filter(s=>s.id!==next.id)])
    setDrafts(current=>promoteNativeDraft(current,scopeDraftKey,next.id))
    if(currentProject.current===projectId)setSelectedId(next.id)
    createAttempt.current=null
    return next
  }
  const create = (event: FormEvent) => {event.preventDefault();void operation(createThread)}
  const startAndSend = async (text:string) => {
    if(starting.current || !text.trim())return
    starting.current=true;setBusy(true);setError('')
    try {
      const next=await createThread()
      // Keep the first message until the real worker is ready; never simulate a reply.
      pendingFirst.current={id:next.id,text}
      try { const titled=await nativeClient.updateNativeSession(next.id,{expectedRevision:next.metadataRevision,title:text.trim().slice(0,64)});setSessions(current=>current.map(s=>s.id===next.id?titled:s)) } catch { /* Message delivery remains available if metadata conflicts. */ }
    } catch(cause){setError(describe(cause));throw cause}
    finally{starting.current=false;setBusy(false)}
  }
  const newThread=()=>{setSelectedId('');setError('')}
  const updateThread=async(id:string,update:{title?:string;archived?:boolean})=>{
    const target=sessions.find(s=>s.id===id);if(!target)throw Error('会话不存在')
    const next=await nativeClient.updateNativeSession(id,{expectedRevision:target.metadataRevision,...update})
    setSessions(current=>current.map(s=>s.id===id?next:s))
    if(next.archived&&selectedId===id)setSelectedId('')
  }
  const send = async (text: string) => {
    const current = requireCurrentSession()
    if(text.trim()&&!current.busy&&!current.session.archived&&['closed','disconnected'].includes(current.state.worker)) {
      setBusy(true)
      try {await reconnectNativeSession(current.session.id);pendingFirst.current={id:current.session.id,text}}
      finally{setBusy(false)}
      return
    }
    if (!text.trim() || current.state.worker !== 'ready' || current.busy) throw new Error('当前原生会话不可发送。')
    const id = current.session.id
    if (current.turnSelection.profileId !== current.session.scope.profileId) throw new Error('只能为当前已连接的原生工作者选择模型。')
    const options: NativeTurnOptions = { model: current.turnSelection.model, effort: current.turnSelection.effort, permission: current.turnSelection.permission }
    const fingerprint = JSON.stringify([id, text, options])
    let attempt = promptAttempts.current.get(fingerprint)
    if (attempt?.inFlight) {
      await attempt.inFlight
      return
    }
    if (!attempt) {
      attempt = { key: crypto.randomUUID() }
      promptAttempts.current.set(fingerprint, attempt)
    }
    const pending = sendNativePrompt(id, text, attempt.key, options)
    attempt.inFlight = pending
    setPrompting(current => new Set([...current, id]))
    try {
      await pending
      if (promptAttempts.current.get(fingerprint) === attempt) promptAttempts.current.delete(fingerprint)
    } finally {
      attempt.inFlight = undefined
      setPrompting(current => { const next = new Set(current); next.delete(id); return next })
    }
  }
  useEffect(()=>{
    const pending=pendingFirst.current
    if(!pending||pending.id!==session?.id||!streamMatchesSelection||state.worker!=='ready'||busy)return
    pendingFirst.current=null
    void send(pending.text).then(()=>setDrafts(current=>({...current,[pending.id]:''}))).catch(cause=>{setDrafts(current=>({...current,[pending.id]:pending.text}));setError(describe(cause))})
  },[session?.id,streamMatchesSelection,state.worker,busy])
  const respond = async (requestId: string, answer: NativeAnswer) => {
    const current = requireCurrentSession()
    const request = current.state.pending[requestId]
    if (!request || request.submitted || current.busy || ['disconnected', 'closed'].includes(current.state.worker)) {
      throw new Error('此原生请求已不再可答复，请重新读取会话记录。')
    }
    await answerNativeRequest(current.session.id, requestId, answer)
  }
  const interrupt = async () => {
    const current = requireCurrentSession()
    if (current.busy || !['running', 'awaiting-input'].includes(current.state.worker)) throw new Error('当前会话没有可取消的原生任务。')
    await cancelNativeTurn(current.session.id)
  }

  return <NativeAgentSessionContext.Provider value={{
    appendDraft, setDraft:(text)=>setDrafts(current=>({...current,[draftKey]:text})), newThread, startAndSend, updateThread, settings, engineering, setEngineering, busy, connection, connectionProvider, consent, create, createOptions, currentProvider, draft, error,
    externalWorkspace, interrupt, openSession, operation, profileId, profiles, projectId, prompting, reload,
    requireCurrentSession, respond, selectedId, selectedProfile, send, session, sessions: scopedSessions, allSessions:sessions, selectProjectThread:(project,id)=>{if(project===projectId)setSelectedId(id);else{requestedThread.current={project,id};useWorkbench.getState().setProjectId(project)}useWorkbench.getState().setActiveNav('chat')},
    setConsent, setCreateOptions, setDrafts, setProfileId, setRefresh, setReload, setSelectedId,
    setSelections, setWorkspaceId, settingsError, state, streamError, disconnectReason, streamMatchesSelection, turnSelection,
    workspaces, workspaceId,
  }}>{children}</NativeAgentSessionContext.Provider>
}


function describe(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause) }
