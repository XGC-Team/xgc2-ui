// @vitest-environment jsdom
import { remoteConversationScope,syncGroundStationRemoteMessages } from './groundStationRemoteMessages';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { NativeConversation,type NativeStreamTransport,type NativeConversationProps } from '@xgc2/native-agent/react';
import type * as PromptOutboxModule from './nativePromptOutbox';
import type * as NativeReact from '@xgc2/native-agent/react';
import { emptyStream,NATIVE_SCHEMA,type NativeSession,type Scope,type PromptQueue } from '@xgc2/native-agent/state';
import { useGroundStationNativeConversation } from './useGroundStationNativeConversation';
import type { GroundStationNativeBinding } from './groundStationNativeAgentTypes';
import { GroundStationNativeAgentProvider,useGroundStationNativeAgentRegistry } from './GroundStationNativeAgentProvider';
import { GroundStationNativeActivityChat } from './GroundStationNativeActivityChat';
import { GroundStationConversationFrameProvider,GroundStationConversationHeaderActions,GroundStationConversationHeaderLeading } from './GroundStationConversationFrame';
import type * as NativeService from './groundStationNativeAgentService';

const mocks = vi.hoisted(() => ({
  outboxes:new Map<string,unknown>(),
  clients:new Map<string,Record<string,ReturnType<typeof vi.fn>>>(),
  streams:new Map<string,Parameters<NativeStreamTransport>[0]>(),closed:vi.fn(),conversation:vi.fn(),capabilities:vi.fn(),settings:vi.fn(),
  bindWorkspace:vi.fn(),attention:vi.fn(async () => ({data:{sessions:[],revision:'empty'}})),
}));
vi.mock('./nativePromptOutbox',async importOriginal => {
  const original=await importOriginal<typeof PromptOutboxModule>();
  return {...original,nativePromptOutbox:(id:string)=>{if(!mocks.outboxes.has(id))mocks.outboxes.set(id,new original.NativePromptOutbox(id));return mocks.outboxes.get(id)}};
});
vi.mock('@xgc2/native-agent/react',async importOriginal => {
  const original=await importOriginal<typeof NativeReact>();
  return {...original,NativeConversation:(props:NativeConversationProps) => {
    mocks.conversation(props); return <original.NativeConversation {...props} />;
  }};
});
vi.mock('../../api/http',() => ({request:mocks.attention}));
vi.mock('../../api/nativeAgent',() => ({fetchNativeAgent:vi.fn(),openNativeAgentStream:(options:Parameters<NativeStreamTransport>[0]) => {
  mocks.streams.set(options.url,options); options.onOpen();
  return {close:() => {mocks.closed(options.url); if (mocks.streams.get(options.url) === options) mocks.streams.delete(options.url);}};
}}));
vi.mock('./groundStationNativeAgentService',async importOriginal => ({
  ...await importOriginal<typeof NativeService>(),
  createGroundStationNativeClient:(experimentId:string) => mocks.clients.get(experimentId),
  getGroundStationNativeCapabilities:mocks.capabilities,bindGroundStationWorkspace:mocks.bindWorkspace,
}));
vi.mock('./groundStationNativeSettingsService',() => ({getNativeProviderSettings:mocks.settings,refreshNativeProviderSettings:vi.fn()}));
const workspace = {id:'debug',revision:'a'.repeat(64)};
const profile = {id:'codex-local',provider:'codex',protocol:'codex/app-server',available:true,detail:'',reviewedVersion:'fixture',interactiveRequests:true,toolMode:'native'};
function nativeSession(experimentId:string,id = `s_${experimentId}`):NativeSession {
  return {schemaVersion:NATIVE_SCHEMA,id,scope:{profileId:profile.id,context:{kind:'experiment',id:experimentId},workspace,nativeAccessConfirmed:true},
    provider:'codex',state:'ready',createdAt:'2026-09-06T00:00:00Z',lastSeq:0,title:'',archived:false,metadataRevision:1,runtimeId:'r_fixture'};
}
function client(experimentId:string,initial:NativeSession[] = []) {
  const sessions = new Map(initial.map(session => [session.id,session]));
  const api = {
    getNativeSessionPage:vi.fn(async () => ({sessions:[...sessions.values()].reverse()})),
    getNativeSession:vi.fn(async (id:string) => {
      const session = sessions.get(id);
      if (!session) throw Object.assign(new Error('Conversation not found'),{status:404});
      return session;
    }),
    updateNativePromptQueue:vi.fn(async (_id:string,_command:unknown,_key:string):Promise<PromptQueue> => ({revision:1,paused:false,items:[]})),
    getNativeInputs:vi.fn(async () => []),
    createNativeSession:vi.fn(async (scope:Scope,_key:string) => {
      const session = {...nativeSession(experimentId,`s_${experimentId}_${sessions.size+1}`),scope};
      sessions.set(session.id,session); return session;
    }),
    sendNativePrompt:vi.fn(async (_id:string,_message:string,_key:string,_options?:unknown) => `t_${'a'.repeat(32)}`),
    answerNativeRequest:vi.fn(async () => ({submitted:true})),cancelNativeTurn:vi.fn(async () => ({requested:true})),
    closeNativeSession:vi.fn(async () => ({requested:true})),
    reconnectNativeSession:vi.fn(async (id:string) => {sessions.set(id,{...sessions.get(id)!,state:'ready'}); return {requested:true};}),
    updateNativeSession:vi.fn(),
  };
  mocks.clients.set(experimentId,api);
  return api;
}
let registry:ReturnType<typeof useGroundStationNativeAgentRegistry>;
function Probe() {registry = useGroundStationNativeAgentRegistry(); return null;}
function Harness({experimentId='experiment-a',targetId='local',visible=true}:{experimentId?:string;targetId?:string;visible?:boolean}) {
  return <GroundStationNativeAgentProvider executionTargetId={targetId}><Probe />
    <GroundStationConversationFrameProvider>
      <header data-testid="panel-header">
        <GroundStationConversationHeaderLeading />
        <GroundStationConversationHeaderActions />
      </header>
      {visible ? <GroundStationNativeActivityChat key={experimentId} experimentId={experimentId} targetId={targetId} enabled presentation="panel"
        decisions={[]} statuses={[]} contexts={[]} streamState="connected" inventoryError="" onDismiss={vi.fn()} onRespond={vi.fn()} /> : null}
    </GroundStationConversationFrameProvider>
  </GroundStationNativeAgentProvider>;
}
async function typeAndSend(message:string) {
  const editor = await screen.findByRole('textbox',{name:'Message the agent'});
  const user = userEvent.setup();
  await user.click(editor); window.getSelection()?.selectAllChildren(editor);
  await user.paste(message);
  const send = screen.getByRole('button',{name:'Send message'});
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.outboxes.clear(); mocks.clients.clear(); mocks.streams.clear(); registry=null;
  Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:() => new DOMRect()});
  Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:() => []});
  vi.stubGlobal('ClipboardEvent',class extends Event {
    clipboardData:DataTransfer | null;
    constructor(type:string,init:ClipboardEventInit = {}) {super(type,init); this.clipboardData=init.clipboardData ?? null;}
  });
  mocks.capabilities.mockImplementation(async (experimentId:string) => ({available:true,detail:'',profiles:[profile],workspaces:[{...workspace,label:'Project'}],
    workspaceBinding:{experimentId,workspace,revision:1},executionTargetId:'local',experimentServices:true}));
  mocks.settings.mockResolvedValue({revision:'fixture',providers:[{...profile,enabled:true,binaryPath:'/fixture/codex',version:'fixture',login:{status:'authenticated',detail:''},
    defaults:{model:'model-one',effort:'medium',permission:'approval-required'},models:[{id:'model-one',label:'Model one',efforts:[{id:'medium',label:'Medium'}]}],
    permissions:[{id:'approval-required',label:'Ask first',description:'Review actions'}]}]});
});
afterEach(() => {vi.unstubAllGlobals(); Reflect.deleteProperty(Range.prototype,'getBoundingClientRect'); Reflect.deleteProperty(Range.prototype,'getClientRects');});

describe('persistent experiment conversations',() => {
  it.each(['capabilities','settings'] as const)('queues the first message immediately while %s loads, then creates one scoped conversation',async source => {
    const api=client('experiment-a');
    const original=mocks[source].getMockImplementation()!;
    let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve;});
    mocks[source].mockImplementation(async (...args:unknown[])=>{await pending;return original(...args);});
    render(<StrictMode><Harness /></StrictMode>);
    await typeAndSend('Read the current experiment status');
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Message the agent'})).toHaveTextContent(''));
    expect(screen.getByText('Read the current experiment status')).toBeVisible();
    expect(api.createNativeSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose an available native provider.')).toBeNull();
    await act(async()=>release());
    await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
    expect(api.createNativeSession).toHaveBeenCalledWith(expect.objectContaining({profileId:profile.id,
      context:{kind:'experiment',id:'experiment-a'},workspace,options:{model:'model-one',effort:'medium',permission:'approval-required'}}),expect.any(String));
  });

  it('shows only the empty composer and choices, with session controls in the panel header',async () => {
    const api=client('experiment-a'); render(<Harness />);
    await screen.findByRole('button',{name:'Thinking effort'});
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toBeVisible();
    expect(screen.queryByRole('button',{name:/connect/i})).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-native-connection"]')).toBeNull();
    expect(screen.queryByText('Experiment workspace')).toBeNull();
    const header = screen.getByTestId('panel-header');
    const conversations = screen.getByRole('button',{name:'Conversations'});
    const add = screen.getByRole('button',{name:'New conversation'});
    expect(header).toContainElement(conversations);
    expect(header).toContainElement(add);
    expect(screen.queryByRole('button',{name:'Chat settings'})).toBeNull();
    expect(conversations.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add).toHaveClass('xgc-panel-runtime-action');
    expect(add).toHaveAttribute('data-xgc-appearance','raised');
    expect(add.querySelector('svg')).toHaveAttribute('width','13');
    expect(api.createNativeSession).not.toHaveBeenCalled();
    await typeAndSend('Inspect current panel states');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
    expect(api.updateNativePromptQueue).toHaveBeenCalledWith('s_experiment-a_1',{operation:'enqueue',text:'Inspect current panel states',
      options:{model:'model-one',effort:'medium',permission:'approval-required'}},expect.any(String));
  });
  it('discovers server history without localStorage and resumes the same conversation only on send',async () => {
    const saved={...nativeSession('experiment-a'),state:'disconnected' as const,nativeSessionId:'native-thread-one'};
    const api=client('experiment-a',[saved]); render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(saved.id));
    expect(api.createNativeSession).not.toHaveBeenCalled(); expect(api.reconnectNativeSession).not.toHaveBeenCalled();
    await screen.findByRole('button',{name:'Thinking effort'});
    await typeAndSend('Explain the failed panel');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(api.reconnectNativeSession).toHaveBeenCalledWith(saved.id);
    expect(api.updateNativePromptQueue.mock.calls[0][0]).toBe(saved.id);
    expect(api.createNativeSession).not.toHaveBeenCalled();
  });
  it('renders a manual remote in a blank conversation and keeps the message when its first prompt creates the session',async () => {
    const api = client('experiment-a');
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBeNull());
    act(() => syncGroundStationRemoteMessages('experiment-a','robot-panel',[{id:'blank-remote',robots:[{name:'scout-01'}]}],remoteConversationScope('experiment-a',null)));
    await waitFor(() => expect(mocks.conversation.mock.lastCall?.[0].additionalItems?.some((item:{id:string}) => item.id === 'remote:blank-remote')).toBe(true));
    expect(api.createNativeSession).not.toHaveBeenCalled();
    await typeAndSend('Inspect this experiment');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(mocks.conversation.mock.lastCall?.[0].additionalItems?.some((item:{id:string}) => item.id === 'remote:blank-remote')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
    await waitFor(() => expect(mocks.conversation.mock.lastCall?.[0].additionalItems?.some((item:{id:string}) => item.id === 'remote:blank-remote')).toBe(false));
  });
  it('creates and switches multiple conversations without closing earlier runtimes',async () => {
    const saved=nativeSession('experiment-a'); const api=client('experiment-a',[saved]); render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(saved.id));
    fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
    await typeAndSend('Start a separate investigation');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(registry?.bindings).toHaveLength(2);
    expect(api.closeNativeSession).not.toHaveBeenCalled();
    await act(async () => registry!.select('experiment-a',saved.id));
    expect(registry?.selected['experiment-a']).toBe(saved.id);
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
  });
  it('preserves a failed first message and its idempotency key after creating the conversation',async () => {
    const api=client('experiment-a'); api.updateNativePromptQueue.mockRejectedValue(new Error('Native turn rejected'));
    render(<Harness />); await typeAndSend('Read the selected robot configuration');
    await screen.findByText('Native turn rejected');
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toHaveTextContent('');
    expect(screen.getByText('Read the selected robot configuration')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Retry'}));
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));
    expect(api.updateNativePromptQueue.mock.calls[0][2]).toBe(api.updateNativePromptQueue.mock.calls[1][2]);
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
  });
  it('keeps the same editor and caret when the selected conversation receives its first projection',async () => {
    const session=nativeSession('experiment-a');
    const binding:GroundStationNativeBinding={experimentId:'experiment-a',sessionId:session.id,session,reload:0};
    function HydratingConversation({binding}:{binding:GroundStationNativeBinding}) {
      const conversation=useGroundStationNativeConversation('experiment-a',binding);
      return <NativeConversation state={conversation.state} active locale="en" queueEnabled onAnswer={vi.fn(async()=>undefined)} onSend={vi.fn(async()=>undefined)} />;
    }
    const view=render(<HydratingConversation binding={binding} />);
    const editor=screen.getByRole('textbox',{name:'Message the agent'});
    const user=userEvent.setup();await user.click(editor);await user.paste('Keep typing');
    view.rerender(<HydratingConversation binding={{...binding,projection:{state:emptyStream(session.id,'codex'),connection:'connected',error:''}}} />);
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toBe(editor);
    expect(editor).toHaveTextContent('Keep typing');expect(editor).toHaveFocus();
  });
  it('shows the user message before a slow acknowledgement and preserves the next draft',async () => {
    const saved=nativeSession('experiment-a'); const api=client('experiment-a',[saved]);
    let finish!:(queue:PromptQueue)=>void;
    api.updateNativePromptQueue.mockImplementation(() => new Promise<PromptQueue>(resolve => {finish=resolve;}));
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(saved.id));
    await typeAndSend('Immediate local message');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Immediate local message')).toBeVisible();
    expect(screen.getByRole('button',{name:'Remove message'})).toBeDisabled();
    const editor=screen.getByRole('textbox',{name:'Message the agent'});
    expect(editor).toHaveTextContent('');
    const user=userEvent.setup(); await user.click(editor); await user.paste('Next draft');
    await act(async () => finish({revision:1,paused:true,items:[{id:`t_${'b'.repeat(32)}`,text:'Immediate local message',options:{},requestOptions:{},createdAt:'2026-09-08T00:00:00Z'}]}));
    expect(editor).toHaveTextContent('Next draft');
    expect(screen.getAllByText('Immediate local message')).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Remove message'})).toBeEnabled();
  });
  it('adopts the only reviewed workspace on first send without opening chat settings',async () => {
    const api=client('experiment-a');
    mocks.capabilities.mockResolvedValue({available:true,detail:'',profiles:[profile],workspaces:[{...workspace,label:'Project'}],workspaceBinding:null,executionTargetId:'local',experimentServices:true});
    mocks.bindWorkspace.mockResolvedValue({experimentId:'experiment-a',workspace,revision:1});
    render(<Harness />); await typeAndSend('Inspect this experiment');
    await waitFor(() => expect(api.createNativeSession).toHaveBeenCalledTimes(1));
    expect(mocks.bindWorkspace).toHaveBeenCalledWith('experiment-a',workspace,0);
    expect(screen.queryByText('Experiment workspace')).toBeNull();
    expect(screen.queryByText('Choose this experiment’s workspace in chat settings.')).toBeNull();
  });
  it('keeps experiments isolated and releases only their visible transcript stream when parked',async () => {
    const a=client('experiment-a',[nativeSession('experiment-a')]); client('experiment-b',[nativeSession('experiment-b')]);
    const view=render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe('s_experiment-a'));
    await waitFor(() => expect(mocks.streams.size).toBe(1));
    view.rerender(<Harness experimentId="experiment-b" />);
    await waitFor(() => expect(registry?.selected['experiment-b']).toBe('s_experiment-b'));
    expect(registry?.selected['experiment-a']).toBe('s_experiment-a');
    expect([...mocks.streams.keys()].every(url => url.includes('experiment-b'))).toBe(true);
    expect(a.closeNativeSession).not.toHaveBeenCalled();
    view.rerender(<Harness experimentId="experiment-b" visible={false} />);
    await waitFor(() => expect(mocks.streams.size).toBe(0));
    const selected=JSON.parse(localStorage.getItem('xgc.ground-station.conversation-selection.v2')!);
    expect(selected).toEqual({'experiment-a':'s_experiment-a','experiment-b':'s_experiment-b'});
  });
  it('does not issue local requests from callbacks retained across a target change',async () => {
    const api=client('experiment-a',[nativeSession('experiment-a')]); const view=render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe('s_experiment-a'));
    const send=registry!.send;
    view.rerender(<Harness targetId="remote-one" />);
    await expect(send('experiment-a','Do not deliver')).rejects.toThrow('local execution target');
    expect(api.updateNativePromptQueue).not.toHaveBeenCalled(); expect(registry?.pendingInputs).toEqual([]);
    await waitFor(() => expect(mocks.streams.size).toBe(0));
  });
});
