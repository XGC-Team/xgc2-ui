// @vitest-environment jsdom
import { remoteConversationScope,syncGroundStationRemoteMessages,isGroundStationRemoteMessageClosed } from './groundStationRemoteMessages';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AgentConversation,type AgentStreamTransport,type AgentConversationProps } from '@xgc2/agent-runtime/react';
import type * as PromptOutboxModule from './nativePromptOutbox';
import type * as AgentReact from '@xgc2/agent-runtime/react';
import { emptyStream,AGENT_RUNTIME_SCHEMA,type AgentSession,type Scope,type PromptQueue } from '@xgc2/agent-runtime/state';
import { useGroundStationAgentConversation } from './useGroundStationAgentConversation';
import type { GroundStationNativeBinding } from './groundStationAgentTypes';
import { GroundStationAgentProvider,useGroundStationNativeAgentRegistry } from './GroundStationAgentProvider';
import { GroundStationAgentActivityChat } from './GroundStationAgentActivityChat';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import { GroundStationConversationFrameProvider,GroundStationConversationHeaderActions,GroundStationConversationHeaderLeading } from './GroundStationConversationFrame';
import type * as AgentService from './groundStationAgentService';

const mocks = vi.hoisted(() => ({
  outboxes:new Map<string,unknown>(),
  clients:new Map<string,Record<string,ReturnType<typeof vi.fn>>>(),
  streams:new Map<string,Parameters<AgentStreamTransport>[0]>(),closed:vi.fn(),conversation:vi.fn(),capabilities:vi.fn(),settings:vi.fn(),
  bindWorkspace:vi.fn(),attention:vi.fn(async () => ({data:{sessions:[],revision:'empty'}})),
}));
vi.mock('./nativePromptOutbox',async importOriginal => {
  const original=await importOriginal<typeof PromptOutboxModule>();
  return {...original,nativePromptOutbox:(id:string)=>{if(!mocks.outboxes.has(id))mocks.outboxes.set(id,new original.AgentPromptOutbox(id));return mocks.outboxes.get(id)}};
});
vi.mock('@xgc2/agent-runtime/react',async importOriginal => {
  const original=await importOriginal<typeof AgentReact>();
  return {...original,AgentConversation:(props:AgentConversationProps) => {
    mocks.conversation(props); return <original.AgentConversation {...props} />;
  }};
});
vi.mock('../../api/http',() => ({request:mocks.attention}));
vi.mock('../../api/nativeAgent',() => ({fetchNativeAgent:vi.fn(),openNativeAgentStream:(options:Parameters<AgentStreamTransport>[0]) => {
  mocks.streams.set(options.url,options); options.onOpen();
  return {close:() => {mocks.closed(options.url); if (mocks.streams.get(options.url) === options) mocks.streams.delete(options.url);}};
}}));
vi.mock('./groundStationAgentService',async importOriginal => ({
  ...await importOriginal<typeof AgentService>(),
  createGroundStationNativeClient:(experimentId:string) => mocks.clients.get(experimentId),
  getGroundStationNativeCapabilities:mocks.capabilities,bindGroundStationWorkspace:mocks.bindWorkspace,
}));
vi.mock('./groundStationAgentSettingsService',() => ({getNativeProviderSettings:mocks.settings,refreshNativeProviderSettings:vi.fn()}));
const workspace = {id:'debug',revision:'a'.repeat(64)};
const profile = {id:'codex-local',provider:'codex',protocol:'codex/app-server',available:true,detail:'',reviewedVersion:'fixture',interactiveRequests:true,toolMode:'native'};
function nativeSession(experimentId:string,id = `s_${experimentId}`):AgentSession {
  return {schemaVersion:AGENT_RUNTIME_SCHEMA,id,scope:{profileId:profile.id,context:{kind:'experiment',id:experimentId},workspace,accessConfirmed:true},
    provider:'codex',state:'ready',createdAt:'2026-09-06T00:00:00Z',lastSeq:0,title:'',archived:false,metadataRevision:1,runtimeId:'r_fixture'};
}
function client(experimentId:string,initial:AgentSession[] = []) {
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
function operatorConfirm(id:string,title:string,status:'open' | 'resolved' = 'resolved'): GroundStationDecisionInteraction {
  return {
    schemaVersion: 1,id,targetScope: 'local',revision: 1,status,
    kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
    title,message: `${title} for the selected PX4 robots?`,
    origin: { type: 'automation',ref: title,experimentId: 'experiment-a' },audience: { scope: 'all' },
    createdAt: '2026-09-09T00:58:29Z',updatedAt: '2026-09-09T00:58:29Z',
    payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },
    ...(status === 'resolved' ? { response: { action: 'approved' as const,actor: 'station-main',at: '2026-09-09T00:58:29Z' } } : {}),
  };
}
function Harness({experimentId='experiment-a',targetId='local',visible=true,decisions=[]}:{
  experimentId?:string;targetId?:string;visible?:boolean;decisions?:GroundStationDecisionInteraction[];
}) {
  return <GroundStationAgentProvider executionTargetId={targetId}><Probe />
    <GroundStationConversationFrameProvider>
      <header data-testid="panel-header">
        <GroundStationConversationHeaderLeading />
        <GroundStationConversationHeaderActions />
      </header>
      {visible ? <GroundStationAgentActivityChat key={experimentId} experimentId={experimentId} targetId={targetId} enabled presentation="panel"
        decisions={decisions} statuses={[]} contexts={[]} streamState="connected" inventoryError="" onDismiss={vi.fn()} onRespond={vi.fn()} /> : null}
    </GroundStationConversationFrameProvider>
  </GroundStationAgentProvider>;
}
async function typeAndSend(message:string) {
  const editor = await screen.findByRole('textbox',{name:'Message the agent'});
  const user = userEvent.setup();
  await user.click(editor); window.getSelection()?.selectAllChildren(editor);
  await user.paste(message);
  const send = screen.getByRole('button',{name:'Send message'});
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
}
function additionalItemIds() {
  return ((mocks.conversation.mock.lastCall?.[0].additionalItems ?? []) as Array<{id:string}>).map(item => item.id);
}
function lastRemoteMessage(id:string) {
  const items = (mocks.conversation.mock.lastCall?.[0].additionalItems ?? []) as Array<{id:string;content:ReactNode}>;
  return items.find(item => item.id === id)?.content;
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
    // The optimistic row appears immediately; the draft clears only after admission.
    await waitFor(()=>expect(screen.getAllByText('Read the current experiment status').length).toBeGreaterThan(0));
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toHaveTextContent('Read the current experiment status');
    expect(api.createNativeSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose an available provider.')).toBeNull();
    await act(async()=>release());
    await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Message the agent'})).toHaveTextContent(''));
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
    expect(api.createNativeSession).toHaveBeenCalledWith(expect.objectContaining({profileId:profile.id,
      context:{kind:'experiment',id:'experiment-a'},workspace,options:{model:'model-one',effort:'medium',permission:'approval-required'}}),expect.any(String));
  });

  it('shows only the empty composer and choices, with session controls in the panel header',async () => {
    const api=client('experiment-a'); render(<Harness />);
    await screen.findByRole('button',{name:'Thinking effort'});
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toBeVisible();
    expect(screen.queryByRole('button',{name:/connect/i})).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-agent-connection"]')).toBeNull();
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
  it('keeps a pending operator decision outside virtual history until it is resolved',async () => {
    client('experiment-a',[nativeSession('experiment-a')]);
    const view=render(<Harness decisions={[operatorConfirm('arm','Confirm Arm','open')]} />);
    const cancel=await screen.findByRole('button',{name:'Cancel'});
    expect(cancel.closest('[data-xgc-role="agent-item"]')).toBeNull();
    expect(cancel.closest('[data-xgc-role="agent-request-queue"]')).not.toBeNull();
    expect(additionalItemIds().some(id=>id.includes(':arm:request'))).toBe(false);
    view.rerender(<Harness decisions={[operatorConfirm('arm','Confirm Arm')]} />);
    await waitFor(() => {
      const ids = additionalItemIds();
      expect(ids.some(id => id.includes(':arm:request'))).toBe(true);
      expect(ids.some(id => id.includes(':arm:response'))).toBe(true);
      expect(ids.some(id => id.includes(':arm:result'))).toBe(true);
    });
    expect(screen.queryByRole('button',{name:'Cancel'})).toBeNull();
    const receipts = render(<>{(mocks.conversation.mock.lastCall?.[0].additionalItems as Array<{content: ReactNode}>).map((item) => item.content)}</>);
    expect(receipts.container).toHaveTextContent('Confirm Arm?');
    expect(receipts.container).toHaveTextContent('Awaiting execution receipt');
    expect(receipts.container).not.toHaveTextContent(/the selected/i);
    receipts.unmount();
  });
  it('discovers server history without localStorage and resumes the same conversation only on send',async () => {
    const saved={...nativeSession('experiment-a'),state:'disconnected' as const,providerSessionId:'native-thread-one'};
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
    await waitFor(() => expect(lastRemoteMessage('remote:blank-remote')).toBeTruthy());
    const open = render(<>{lastRemoteMessage('remote:blank-remote')}</>);
    const caption = open.container.querySelector('[data-xgc-role="robot-remote-control-title"]');
    const dock = open.container.querySelector('[data-xgc-role="ground-station-remote-dock"]');
    expect(caption).toHaveTextContent('Remote controller for scout-01');
    expect(caption!.compareDocumentPosition(dock!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await typeAndSend('Inspect this experiment');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(mocks.conversation.mock.lastCall?.[0].additionalItems?.some((item:{id:string}) => item.id === 'remote:blank-remote')).toBe(true);
    expect(lastRemoteMessage('remote:blank-remote')).toBeTruthy();
    act(() => syncGroundStationRemoteMessages('experiment-a','robot-panel',[],remoteConversationScope('experiment-a',null)));
    await waitFor(() => expect(isGroundStationRemoteMessageClosed('experiment-a','blank-remote')).toBe(true));
    const closed = render(<>{lastRemoteMessage('remote:blank-remote')}</>);
    expect(closed.container.querySelector('[data-xgc-role="robot-remote-control-closed"]')).toHaveTextContent('Remote controller for scout-01 closed');
    expect(closed.container.querySelector('[data-xgc-role="ground-station-remote-dock"]')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
    await waitFor(() => expect(mocks.conversation.mock.lastCall?.[0].additionalItems?.some((item:{id:string}) => item.id === 'remote:blank-remote')).toBe(false));
  });
  it('puts a long robot list in chat copy immediately before the pad',async () => {
    client('experiment-a');
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBeNull());
    act(() => syncGroundStationRemoteMessages('experiment-a','robot-panel',[{
      id:'swarm-remote',
      robots:['px4-01','px4-02','px4-03','px4-04','px4-05','mecanum-01','mecanum-02'].map(name => ({name})),
    }],remoteConversationScope('experiment-a',null)));
    await waitFor(() => expect(lastRemoteMessage('remote:swarm-remote')).toBeTruthy());
    const view = render(<>{lastRemoteMessage('remote:swarm-remote')}</>);
    const copy = view.container.querySelector('[data-xgc-role="robot-remote-control-title"]');
    const dock = view.container.querySelector('[data-xgc-role="ground-station-remote-dock"]');
    expect(copy).toHaveTextContent('Remote controller for px4-01, px4-02, px4-03, px4-04, px4-05, mecanum-01, mecanum-02');
    expect(copy!.compareDocumentPosition(dock!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelector('[data-xgc-role="robot-remote-control"]')).toBeNull();
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
    // A rejected send keeps the draft; only successful admission clears it.
    expect(screen.getByRole('textbox',{name:'Message the agent'})).toHaveTextContent('Read the selected robot configuration');
    expect(screen.getAllByText('Read the selected robot configuration').length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button',{name:'Retry'}));
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));
    expect(api.updateNativePromptQueue.mock.calls[0][2]).toBe(api.updateNativePromptQueue.mock.calls[1][2]);
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
  });
  it('keeps the same editor and caret when the selected conversation receives its first projection',async () => {
    const session=nativeSession('experiment-a');
    const binding:GroundStationNativeBinding={experimentId:'experiment-a',sessionId:session.id,session,reload:0};
    function HydratingConversation({binding}:{binding:GroundStationNativeBinding}) {
      const conversation=useGroundStationAgentConversation('experiment-a',binding);
      return <AgentConversation state={conversation.state} active locale="en" queueEnabled onAnswer={vi.fn(async()=>undefined)} onSend={vi.fn(async()=>undefined)} />;
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
    expect(screen.getAllByText('Immediate local message').length).toBeGreaterThan(0);
    expect(screen.getByRole('button',{name:'Remove message'})).toBeDisabled();
    const editor=screen.getByRole('textbox',{name:'Message the agent'});
    // The draft clears only after admission; while the acknowledgement is
    // pending the composer still holds the sent text.
    expect(editor).toHaveTextContent('Immediate local message');
    const user=userEvent.setup(); await user.click(editor); window.getSelection()?.selectAllChildren(editor); await user.paste('Next draft');
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
  it('keeps composer controls disabled when the companion is unavailable', async () => {
    client('experiment-a');
    mocks.capabilities.mockResolvedValue({
      available: false,
      detail: '客户端连接中断。',
      profiles: [],
      workspaces: [],
      workspaceBinding: null,
      executionTargetId: 'local',
      experimentServices: false,
    });
    render(<Harness />);
    await waitFor(() => expect(document.querySelector('[data-xgc-role="agent-composer-controls"]')).toBeTruthy());
    const editor = await screen.findByRole('textbox', { name: 'Message the agent' });
    const user = userEvent.setup();
    await user.click(editor);
    window.getSelection()?.selectAllChildren(editor);
    await user.paste('Inspect this experiment');
    expect(screen.getByRole('button', { name: 'Provider and model' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thinking effort' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Permissions' })).toBeDisabled();
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    expect(send.closest('span')).toHaveAttribute('title', 'The local companion is not connected');
    expect(screen.queryByText(/原生客户端/)).toBeNull();
    expect(screen.queryByRole('button', { name: /connect/i })).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-agent-connection"]')).toBeNull();
  });
  it('does not import resolved Set mode and Arm receipts into a new conversation', async () => {
    const saved = nativeSession('experiment-a');
    client('experiment-a',[saved]);
    render(<Harness decisions={[operatorConfirm('set-mode','Confirm Set mode'),operatorConfirm('arm','Confirm Arm')]} />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(saved.id));
    await waitFor(() => {
      const ids = additionalItemIds();
      expect(ids.some(id => id.includes('set-mode'))).toBe(true);
      expect(ids.some(id => id.includes('arm'))).toBe(true);
    });
    fireEvent.click(screen.getByRole('button',{ name:'New conversation' }));
    await waitFor(() => expect(registry?.selected['experiment-a']).toBeNull());
    await waitFor(() => {
      const ids = additionalItemIds();
      expect(ids.some(id => id.includes('set-mode'))).toBe(false);
      expect(ids.some(id => id.includes('arm'))).toBe(false);
    });
  });
  it('does not claim historical operator receipts onto a blank draft', async () => {
    client('experiment-a');
    render(<Harness decisions={[operatorConfirm('set-mode','Confirm Set mode'),operatorConfirm('arm','Confirm Arm')]} />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBeNull());
    await screen.findByRole('textbox',{ name:'Message the agent' });
    expect(additionalItemIds().some(id => id.includes('set-mode') || id.includes('arm'))).toBe(false);
  });
  it('lists this experiment\'s unarchived conversations and omits archived ones', async () => {
    const live = nativeSession('experiment-a','s_live');
    const archived = { ...nativeSession('experiment-a','s_old'), archived:true, createdAt:'2026-09-01T00:00:00Z' };
    client('experiment-a',[live,archived]);
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(live.id));
    fireEvent.click(screen.getByRole('button',{ name:'Conversations' }));
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      expect.stringMatching(/codex/),
    ]);
    expect(screen.queryByRole('option',{ name:'New conversation' })).toBeNull();
  });
  it('keeps New conversation off the menu and enters a new current conversation from Plus', async () => {
    const saved = nativeSession('experiment-a');
    const older = { ...nativeSession('experiment-a','s_experiment-a_old'), createdAt:'2026-09-01T00:00:00Z' };
    const api = client('experiment-a',[saved,older]);
    api.getNativeSessionPage.mockImplementation(async (_signal?:AbortSignal, query?:{after?:string}) => (
      query?.after ? { sessions:[older] } : { sessions:[saved], nextCursor:'older' }
    ));
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBe(saved.id));
    fireEvent.click(screen.getByRole('button',{ name:'Conversations' }));
    expect(screen.queryByRole('option',{ name:'New conversation' })).toBeNull();
    expect(screen.getByRole('option',{ name: /codex/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option',{ name:'Load older' }));
    await waitFor(() => expect(api.getNativeSessionPage).toHaveBeenCalledWith(undefined,expect.objectContaining({ after:'older' })));
    fireEvent.click(screen.getByRole('button',{ name:'New conversation' }));
    expect(registry?.selected['experiment-a']).toBeNull();
    await typeAndSend('Start a fresh investigation');
    await waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    expect(api.updateNativePromptQueue.mock.calls[0][0]).toBe('s_experiment-a_3');
    expect(api.createNativeSession).toHaveBeenCalledTimes(1);
    expect(api.updateNativePromptQueue.mock.calls[0][0]).not.toBe(saved.id);
  });
  it('does not let history refresh steal a new draft or an empty-list selection', async () => {
    const api = client('experiment-a');
    render(<Harness />);
    await waitFor(() => expect(registry?.selected['experiment-a']).toBeNull());
    fireEvent.click(screen.getByRole('button',{ name:'New conversation' }));
    expect(registry?.selected['experiment-a']).toBeNull();
    api.getNativeSessionPage.mockResolvedValue({ sessions:[nativeSession('experiment-a')] });
    fireEvent.click(screen.getByRole('button',{ name:'Conversations' }));
    await waitFor(() => expect(api.getNativeSessionPage).toHaveBeenCalled());
    expect(registry?.selected['experiment-a']).toBeNull();
    await typeAndSend('Keep this draft current');
    await waitFor(() => expect(api.createNativeSession).toHaveBeenCalledTimes(1));
    expect(api.updateNativePromptQueue.mock.calls[0][0]).toBe('s_experiment-a_1');
  });
});
