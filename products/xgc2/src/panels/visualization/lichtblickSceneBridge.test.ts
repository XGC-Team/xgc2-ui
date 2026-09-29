import { describe,it,expect,vi } from 'vitest';
import type { AutomationRun,AutomationExecutionRelations } from '../../domains/automation/automationPublic';
import { SYSTEM_EXPERIMENT_RUNNER } from '../../domains/experiment/experimentPublic';
import type { ExecutionEvent } from '../../domains/execution/executionPublic';
import { LICHTBLICK_EMBED_CHANNEL,LICHTBLICK_EMBED_VERSION } from './lichtblickEmbedBridge';
import { isLichtblickSceneCommandMessage,replayFrozenSceneCommandError,resolveLichtblickSceneHost,runLichtblickSceneCommand,sceneBindingMessage,validSceneNamespace,type LichtblickSceneHost } from './lichtblickSceneBridge';
import { REPLAY_SCENE_LOCKED_REASON } from '../../domains/experiment/experimentPublic';

const header={ channel:LICHTBLICK_EMBED_CHANNEL,version:LICHTBLICK_EMBED_VERSION,sender:'lichtblick',type:'scene-command' };
const command={ requestId:'one',operation:'get' };
const message={ ...header,requestId:command.requestId,command };
const accepted={ success:true,epoch:'one',revision:2,savedRevision:1,dirty:true,playing:false,sceneTime:0,consumers:[],document:{ schema:'xgc2.scene.v1',id:'scene',frame:'world',obstacles:[] } };
function host():LichtblickSceneHost {
  return { panelId:'viewer',namespace:'/xgc/scene',targetId:'local',editable:true,action:{ id:'scene-command',label:'Edit scene',connected:true,disabledReason:'',defaults:{ sceneNamespace:'/xgc/scene' },trace:{ actionId:'edit',automationResourceId:'scene-workflow',presetId:'scene-edit' },invoke:vi.fn(async () => ({ id:'root',status:'accepted' as const,revision:1 })),control:vi.fn() } };
}
function run(id:string,patch:Partial<AutomationRun>={}):AutomationRun {
  return { id,targetId:'local',status:'succeeded',actionId:'edit',automationResourceId:'scene-workflow',parameters:{},revision:1,...patch,
    ...(patch.result && typeof patch.result==='object' && 'success' in patch.result ? { result:{ resultJson:JSON.stringify(patch.result) } } : {}),
  } as AutomationRun;
}
function setup() {
  let eventListener:((event:ExecutionEvent) => void)|undefined;
  let snapshotListener:(() => void)|undefined;
  const release=vi.fn();
  const services={
    getRun:vi.fn(async (_target:string,id:string) => run(id)),
    getRelations:vi.fn(async () => ({ runId:'root',childRuns:[] }) as unknown as AutomationExecutionRelations),
    subscribeEvents:vi.fn((_target:string,listener:(event:ExecutionEvent) => void) => { eventListener=listener;return release; }),
    subscribeSnapshot:vi.fn((_target:string,listener:() => void) => { snapshotListener=listener;return release; }),
    retainTarget:vi.fn(() => release),
  };
  const flush=async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
  return { services,release,flush,event:(id:string) => eventListener?.({ entityId:id } as ExecutionEvent),snapshot:() => snapshotListener?.() };
}

describe('scene embed contract',() => {
  it('matches the runtime namespace and revision bounds',() => {
    expect(validSceneNamespace('/_lab/scene_1')).toBe(true);
    expect(validSceneNamespace('/'+'a'.repeat(160))).toBe(false);
    expect(isLichtblickSceneCommandMessage({ ...message,command:{ ...command,operation:'clear',expectedEpoch:'one',expectedRevision:0 } })).toBe(false);
  });
  it('accepts exact commands and explicit blank binding revocation',() => {
    expect(isLichtblickSceneCommandMessage(message)).toBe(true);
    for (const operation of ['save','reload']) {
      expect(isLichtblickSceneCommandMessage({ ...message,command:{ ...command,operation,expectedEpoch:'one',expectedRevision:1 } })).toBe(true);
    }
    expect(sceneBindingMessage(undefined)).not.toHaveProperty('binding');
    expect(sceneBindingMessage(host())).toHaveProperty('binding',{ namespace:'/xgc/scene',editable:true });
    expect(resolveLichtblickSceneHost({
      panelId:'viewer',sceneNamespace:'/xgc/scene',action:host().action,targetId:'local',
      webReady:true,bridgeReady:true,lifecycleStopping:false,
    })).toMatchObject({ namespace:'/xgc/scene',editable:true });
    expect(resolveLichtblickSceneHost({
      panelId:'viewer',sceneNamespace:'',action:host().action,targetId:'local',
      webReady:true,bridgeReady:true,lifecycleStopping:false,
    })).toBeUndefined();
  });
  it.each([
    { ...message,sender:'xgc2' },{ ...message,version:1 },{ ...message,extra:true },
    { ...message,command:{ ...command,operation:'ros-service-call' } },
    { ...message,command:{ ...command,service:'/gazebo/delete_model' } },
    { ...message,command:{ ...command,operation:'delete',id:'obstacle' } },
    { ...message,command:{ ...command,requestId:'different' } },
    { ...message,command:{ ...command,operation:'save',expectedEpoch:'one',expectedRevision:1,path:'other.yaml' } },
  ])('rejects malformed or unscoped edit %j',(value) => { expect(isLichtblickSceneCommandMessage(value)).toBe(false); });
  it('does not require the Action default namespace to match the bound scene',async () => {
    const binding=host();binding.action.defaults.sceneNamespace='/different';
    const { services }=setup();
    services.getRun.mockResolvedValue(run('root',{ result:accepted }));
    await expect(runLichtblickSceneCommand(binding,command,new AbortController().signal,services)).resolves.toEqual({ ...accepted,frozen:false });
    expect(binding.action.invoke).toHaveBeenCalledExactlyOnceWith({
      commandJson:JSON.stringify(command),sceneNamespace:'/xgc/scene',
    });
  });
  it('rejects an unconnected Action without inventing a second namespace',async () => {
    const binding=host();binding.action.connected=false;binding.editable=false;binding.action.disabledReason='Connect the scene-command Action.';
    await expect(runLichtblickSceneCommand(binding,command,new AbortController().signal)).rejects.toThrow('Connect the scene-command Action');
    expect(binding.action.invoke).not.toHaveBeenCalled();
  });
});

describe('replay-frozen scene envelope',() => {
  it('parses frozen as runtime truth, defaults its absence to false, and rejects wrong types',async () => {
    const { services }=setup();
    services.getRun.mockResolvedValue(run('root',{ result:{ ...accepted,frozen:true } }));
    const frozen=await runLichtblickSceneCommand(host(),command,new AbortController().signal,services);
    expect(frozen.frozen).toBe(true);
    services.getRun.mockResolvedValue(run('root',{ result:{ ...accepted,frozen:false } }));
    const thawed=await runLichtblickSceneCommand(host(),command,new AbortController().signal,services);
    expect(thawed.frozen).toBe(false);
    services.getRun.mockResolvedValue(run('root',{ result:accepted }));
    const missing=await runLichtblickSceneCommand(host(),command,new AbortController().signal,services);
    expect(missing.frozen).toBe(false);
    services.getRun.mockResolvedValue(run('root',{ result:{ ...accepted,frozen:'yes' } }));
    await expect(runLichtblickSceneCommand(host(),command,new AbortController().signal,services))
      .rejects.toThrow('no accepted scene document');
  });
  it('blocks exactly the mutating operations on a frozen scene',() => {
    for (const operation of ['add','update','delete','clear','replace','save','reload']) {
      expect(replayFrozenSceneCommandError(true,operation)).toBe(REPLAY_SCENE_LOCKED_REASON);
      expect(replayFrozenSceneCommandError(false,operation)).toBe('');
    }
    for (const operation of ['get','undo','redo','resync','play','pause','reset']) {
      expect(replayFrozenSceneCommandError(true,operation)).toBe('');
    }
  });
});

describe('exact scene workflow completion',() => {
  it('waits for terminal execution events, not initial admission',async () => {
    const { services,event,flush,release }=setup();
    services.getRun.mockResolvedValue(run('root',{ status:'running' }));
    const binding=host();const complete=vi.fn();
    const result=runLichtblickSceneCommand(binding,command,new AbortController().signal,services).then(complete);
    await flush();expect(complete).not.toHaveBeenCalled();
    const reads=services.getRun.mock.calls.length;
    event('unrelated');await flush();expect(services.getRun).toHaveBeenCalledTimes(reads);
    services.getRun.mockResolvedValue(run('root',{ result:accepted }));
    event('root');await result;
    expect(complete).toHaveBeenCalledWith({ ...accepted,frozen:false });
    expect(binding.action.invoke).toHaveBeenCalledExactlyOnceWith({
      commandJson:JSON.stringify(command),sceneNamespace:'/xgc/scene',
    });
    expect(release).toHaveBeenCalledTimes(3);
  });
  it('follows only the invoked system root bound child and returns its actual structured result',async () => {
    const { services }=setup();
    services.getRun.mockImplementation(async (_target,id) => id==='root' ? run('root',{ actionId:SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction,automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,parameters:{ panelId:'viewer',presetId:'scene-edit' } }) : run(id,{ result:{ success:false,error:'Unsupported motion',epoch:'one',revision:3 } }));
    services.getRelations.mockResolvedValue({ runId:'root',childRuns:[{ parentRunId:'root',targetId:'local',boundAt:'now',relation:'attached',callNodeId:'invoke-selected-action',childRunId:'exact-child' }] } as unknown as AutomationExecutionRelations);
    expect(await runLichtblickSceneCommand(host(),command,new AbortController().signal,services)).toEqual({ success:false,error:'Unsupported motion',epoch:'one',revision:3 });
    expect(services.getRun.mock.calls.map((call) => call[1])).toEqual(['root','exact-child']);
  });
  it('rejects foreign child Action identity and incomplete terminal output',async () => {
    const { services }=setup();
    services.getRun.mockResolvedValue(run('root',{ result:{ jobId:'accepted-is-not-applied' } }));
    await expect(runLichtblickSceneCommand(host(),command,new AbortController().signal,services)).rejects.toThrow('without its structured scene result');
  });
  it('rejects a transport success without an authoritative scene document',async () => {
    const { services }=setup();services.getRun.mockResolvedValue(run('root',{ result:{ success:true } }));
    await expect(runLichtblickSceneCommand(host(),command,new AbortController().signal,services)).rejects.toThrow('no accepted scene document');
  });
  it('treats applied as the only consumer authority and rejects success dual-read',async () => {
    const { services }=setup();
    const gazebo={
      consumer:'gazebo',epoch:'one',revision:2,applied:true,operational:true,capability:'ok',success:true,message:'applied',
    };
    services.getRun.mockResolvedValue(run('root',{ result:{
      ...accepted,
      consumers:[{ ...gazebo,applyState:'applied' }],
      synchronized:true,
      syncRetryable:false,
    } }));
    const result=await runLichtblickSceneCommand(host(),command,new AbortController().signal,services);
    expect(result.consumers).toEqual([{
      consumer:'gazebo',epoch:'one',revision:2,applied:true,operational:true,capability:'ok',message:'applied',success:true,
    }]);
    expect(result.synchronized).toBe(true);
    expect(result.syncRetryable).toBe(false);
    services.getRun.mockResolvedValue(run('root',{ result:{
      ...accepted,
      consumers:[{ ...gazebo,applied:false,success:true,message:'stale success must not apply' }],
    } }));
    await expect(runLichtblickSceneCommand(host(),command,new AbortController().signal,services))
      .rejects.toThrow('Invalid scene synchronization status.');
    services.getRun.mockResolvedValue(run('root',{ result:{
      ...accepted,
      consumers:[{ consumer:'gazebo',epoch:'one',revision:2,success:true,message:'missing applied' }],
    } }));
    await expect(runLichtblickSceneCommand(host(),command,new AbortController().signal,services))
      .rejects.toThrow('Invalid scene synchronization status.');
  });
  it('forwards capability=unsupported without inventing a Retry contract',async () => {
    const { services }=setup();
    services.getRun.mockResolvedValue(run('root',{ result:{
      ...accepted,
      synchronized:false,
      syncRetryable:false,
      consumers:[{
        consumer:'ugv-reset',epoch:'one',revision:2,applied:false,operational:false,
        capability:'unsupported',success:false,message:'unsupported motion type: spiral',
      }],
    } }));
    const result=await runLichtblickSceneCommand(host(),command,new AbortController().signal,services);
    expect(result.consumers).toEqual([{
      consumer:'ugv-reset',epoch:'one',revision:2,applied:false,operational:false,
      capability:'unsupported',message:'unsupported motion type: spiral',success:false,
    }]);
    expect(result.syncRetryable).toBe(false);
    expect(result).not.toHaveProperty('applyState');
  });
  it('revocation aborts waiting and releases event listeners',async () => {
    const { services,flush,release }=setup();services.getRun.mockResolvedValue(run('root',{ status:'waiting' }));
    const controller=new AbortController();
    const result=runLichtblickSceneCommand(host(),command,controller.signal,services);
    await flush();controller.abort();
    await expect(result).rejects.toThrow('canceled or timed out');expect(release).toHaveBeenCalledTimes(3);
  });
});
