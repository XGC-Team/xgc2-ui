import { describe,expect,it,vi } from 'vitest';
import {
  deliverMarkPromptCommand,
  listMarkPromptTargets,
  markPromptHerdrBridgePlugin,
  resolveCurrentPrimaryAgent,
  validateMarkPromptBrowserRequest,
  validateMarkPromptTargetsRequest,
} from './markPromptHerdrBridgePlugin';

type Rect = { height:number;width:number;x:number;y:number };

type PaneFixture = {
  agent?:string;
  agent_status?:string;
  pane_id:string;
  focused:boolean;
  label?:string;
  rect:Rect;
};

type AgentFixture = {
  agent:string;
  agent_status:string;
  name:string;
  pane_id:string;
  tab_id:string;
  workspace_id:string;
};

type FixtureOptions = {
  agents?:AgentFixture[];
  agentStatus?:string;
  focusedTab?:boolean;
  focusedWorkspace?:boolean;
  layoutPanes?:PaneFixture[];
  promptError?:unknown;
};

const workspaceId = 'workspace';
const tabId = 'workspace:tab';
const primaryPaneId = 'workspace:left-top';
const researchPaneId = 'workspace:left-bottom';
const workerPaneId = 'workspace:worker-0-0';

function fourByFourSplitPanes():PaneFixture[] {
  const panes:PaneFixture[] = [
    {
      agent:'codex',agent_status:'working',label:'xgc2_lead',pane_id:primaryPaneId,
      focused:false,rect:{ height:40,width:32,x:0,y:0 },
    },
    {
      agent:'codex',agent_status:'idle',label:'research_os_lead',pane_id:researchPaneId,
      focused:false,rect:{ height:40,width:32,x:0,y:40 },
    },
  ];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      panes.push({
        pane_id:`workspace:worker-${row}-${column}`,
        focused:row === 0 && column === 0,
        label:row === 0 && column === 0 ? 'xgc2_codex1' : undefined,
        rect:{ height:20,width:17,x:32 + column * 17,y:row * 20 },
      });
    }
  }
  return panes;
}

function agentFixture(
  name:string,
  paneId:string,
  agentStatus = 'working',
  kind = 'codex',
):AgentFixture {
  return {
    agent:kind,
    agent_status:agentStatus,
    name,
    pane_id:paneId,
    tab_id:tabId,
    workspace_id:workspaceId,
  };
}

function leadLabeledPanes(kind = 'codex'):PaneFixture[] {
  return fourByFourSplitPanes().map((pane) => (
    pane.pane_id === primaryPaneId ? { ...pane, agent:kind } : pane
  ));
}

function defaultAgents(agentStatus = 'working'):AgentFixture[] {
  const agents = [
    agentFixture('xgc2_lead',primaryPaneId,agentStatus),
    agentFixture('research_os_lead',researchPaneId,'idle'),
  ];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      agents.push(agentFixture(
        row === 0 && column === 0 ? 'xgc2_codex1' : `worker_${row}_${column}`,
        `workspace:worker-${row}-${column}`,
        'idle',
      ));
    }
  }
  return agents;
}

function herdrFixture(options:FixtureOptions = {}) {
  const calls:string[][] = [];
  const layoutPanes = options.layoutPanes ?? fourByFourSplitPanes();
  const agents = options.agents ?? defaultAgents(options.agentStatus ?? 'working');
  const runner = vi.fn(async (args:string[]):Promise<unknown> => {
    calls.push(args);
    switch (args.slice(0,2).join(' ')) {
      case 'workspace list':
        return {
          result:{
            workspaces:[{
              workspace_id:workspaceId,
              active_tab_id:tabId,
              focused:options.focusedWorkspace ?? true,
            }],
          },
        };
      case 'tab list':
        return { result:{ tabs:[{ tab_id:tabId,focused:options.focusedTab ?? true }] } };
      case 'pane list':
        return {
          result:{
            panes:layoutPanes.map((pane) => ({
              agent:pane.agent,
              agent_status:pane.agent_status,
              label:pane.label,
              pane_id:pane.pane_id,
              tab_id:tabId,
              workspace_id:workspaceId,
              focused:pane.focused,
            })),
          },
        };
      case 'agent list':
        return { result:{ agents } };
      case 'agent prompt':
        if (options.promptError !== undefined) throw options.promptError;
        return { result:{ accepted:true } };
      default:
        throw new Error(`Unexpected Herdr command: ${args.join(' ')}`);
    }
  });
  return { calls,runner };
}

type BridgeMiddleware = (
  request:unknown,
  response:unknown,
  next:() => void,
) => void|Promise<void>;

async function invokeBridgeEndpoint(
  runner:ReturnType<typeof herdrFixture>['runner'],
  body:unknown,
  options:{ method?:string;url?:string;headers?:Record<string,string> } = {},
) {
  let middleware:BridgeMiddleware|undefined;
  const plugin = markPromptHerdrBridgePlugin(runner);
  const configureServer = plugin.configureServer;
  if (typeof configureServer !== 'function') throw new Error('Bridge server hook was not registered.');
  const invokeConfigureServer = configureServer as unknown as (server:unknown) => void;
  invokeConfigureServer({
    middlewares:{
      use(handler:BridgeMiddleware) {
        middleware = handler;
      },
    },
  } as never);
  if (!middleware) throw new Error('Bridge middleware was not registered.');

  let responseBody:unknown;
  const response = {
    headers:new Map<string,string>(),
    statusCode:0,
    setHeader(name:string,value:string) {
      this.headers.set(name,value);
    },
    end(value:string) {
      responseBody = JSON.parse(value) as unknown;
    },
  };
  const method = options.method ?? 'POST';
  const request = {
    method,
    url:options.url ?? '/__xgc/devtools/mark-prompt/command',
    headers:{
      host:'127.0.0.1:5174',
      origin:'http://127.0.0.1:5174',
      ...(method === 'POST' ? { 'content-type':'application/json' } : {}),
      'sec-fetch-site':'same-origin',
      'x-xgc-mark-prompt':'v1',
      ...options.headers,
    },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
  await middleware(request,response,() => undefined);
  return { body:responseBody,statusCode:response.statusCode };
}

describe('Mark Prompt Herdr bridge',() => {
  it('delivers queued prompts to exact xgc2_lead in a split-left plus 4x4 worker layout',async() => {
    const fixture = herdrFixture();
    const prompt = 'Inspect the exact stable selector.';

    const receipt = await deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt,
    },fixture.runner);

    expect(receipt).toEqual({
      schemaVersion:'xgc.mark-prompt-command-receipt/v1',
      status:'accepted',
      delivery:'queued',
      target:{
        agent:'xgc2_lead',
        paneId:primaryPaneId,
        tabId,
        workspaceId,
        primary:true,
        visible:true,
      },
    });
    expect(fixture.calls.at(-1)).toEqual(['agent','prompt',primaryPaneId,prompt]);
    expect(fixture.calls.some((args) => args[0] === 'pane' && args[1] === 'layout')).toBe(false);
    expect(fixture.calls.some((args) => args.includes('--wait'))).toBe(false);
    expect(fixture.calls.some((args) => args[0] === 'agent' && args[1] === 'get')).toBe(false);
  });

  it.each(['codex','claude','grok'] as const)(
    'delivers to the lead-labeled pane when that occupant is %s',
    async (kind) => {
      const agents = defaultAgents().map((agent) => (
        agent.name === 'xgc2_lead' ? { ...agent, agent:kind } : agent
      ));
      const fixture = herdrFixture({ agents,layoutPanes:leadLabeledPanes(kind) });
      const prompt = `Inspect the ${kind} lead.`;

      const receipt = await deliverMarkPromptCommand({
        schemaVersion:'xgc.mark-prompt-command/v1',
        prompt,
      },fixture.runner);

      expect(receipt.target).toMatchObject({ agent:'xgc2_lead',paneId:primaryPaneId,primary:true });
      expect(fixture.calls.at(-1)).toEqual(['agent','prompt',primaryPaneId,prompt]);
    },
  );

  it('keeps the lead when the concurrent pane projection briefly omits its pane',async() => {
    const fixture = herdrFixture({
      layoutPanes:fourByFourSplitPanes().filter((pane) => pane.pane_id !== primaryPaneId),
    });

    const target = await resolveCurrentPrimaryAgent(fixture.runner);

    expect(target).toMatchObject({
      paneLabel:'xgc2_lead',paneId:primaryPaneId,tabId,workspaceId,primary:true,
    });
  });

  it('recovers only one same-workspace CLI occupant on the exact lead-labeled pane',async() => {
    const unnamedLead = agentFixture('',primaryPaneId,'working');
    const fixture = herdrFixture({
      agents:[unnamedLead,agentFixture('worker_0_0','workspace:worker-0-0','idle')],
    });

    const target = await resolveCurrentPrimaryAgent(fixture.runner);

    expect(target).toEqual({
      paneId:primaryPaneId,
      paneLabel:'xgc2_lead',
      kind:'codex',
      agentStatus:'working',
      primary:true,
      workspaceId,
      tabId,
      deliveryTarget:primaryPaneId,
    });
  });

  it.each(['codex','claude','grok'] as const)(
    'delivers unnamed %s occupants on the lead-labeled pane through the pane id',
    async (kind) => {
      const fixture = herdrFixture({
        agents:[
          agentFixture('',primaryPaneId,'working',kind),
          agentFixture('worker_0_0','workspace:worker-0-0','idle',kind),
        ],
        layoutPanes:leadLabeledPanes(kind),
      });
      const prompt = `Queue this ${kind} lead prompt.`;

      const receipt = await deliverMarkPromptCommand({
        schemaVersion:'xgc.mark-prompt-command/v1',
        prompt,
      },fixture.runner);

      expect(receipt.target).toMatchObject({
        agent:'xgc2_lead',paneId:primaryPaneId,primary:true,visible:true,
      });
      expect(fixture.calls.at(-1)).toEqual(['agent','prompt',primaryPaneId,prompt]);
    },
  );

  it('does not recover a lead-labeled pane that has no detected CLI occupant',async() => {
    const fixture = herdrFixture({
      agents:[agentFixture('worker_0_0','workspace:worker-0-0','working')],
      layoutPanes:fourByFourSplitPanes().map((pane) => (
        pane.pane_id === primaryPaneId
          ? { ...pane, agent:undefined,agent_status:'unknown' }
          : pane
      )),
    });

    await expect(resolveCurrentPrimaryAgent(fixture.runner))
      .rejects.toMatchObject({
        code:'target-unavailable',
        message:'The xgc2_lead lead could not be uniquely verified in the focused Herdr workspace; no prompt was sent.',
      });
  });

  it('ignores focused research and worker panes when the default primary is used',async() => {
    const layoutPanes = fourByFourSplitPanes().map((pane) => ({
      ...pane,
      focused:pane.pane_id === researchPaneId,
    }));
    const fixture = herdrFixture({ layoutPanes });
    const target = await resolveCurrentPrimaryAgent(fixture.runner);

    expect(target.paneLabel).toBe('xgc2_lead');
    expect(target.paneId).toBe(primaryPaneId);
  });

  it('does not select research_os_lead or workers when xgc2_lead is missing and no target is given',async() => {
    const fixture = herdrFixture({
      agents:[
        agentFixture('research_os_lead',researchPaneId,'working'),
        agentFixture('xgc2_codex1',workerPaneId,'working'),
      ],
      layoutPanes:fourByFourSplitPanes().map((pane) => (
        pane.pane_id === primaryPaneId
          ? { ...pane, agent:undefined,agent_status:'unknown',label:undefined }
          : pane
      )),
    });

    await expect(deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Do the work.',
    },fixture.runner)).rejects.toMatchObject({
      code:'target-unavailable',
      message:'The xgc2_lead lead could not be uniquely verified in the focused Herdr workspace; no prompt was sent.',
    });
    expect(fixture.calls.some((args) => args[0] === 'agent' && args[1] === 'prompt')).toBe(false);
  });

  it('delivers to the selected worker pane instead of the lead',async() => {
    const fixture = herdrFixture();
    const prompt = 'Fix the Scout instruments.';

    const receipt = await deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt,
      target:'xgc2_codex1',
    },fixture.runner);

    expect(receipt).toMatchObject({
      status:'accepted',
      delivery:'started',
      target:{
        agent:'xgc2_codex1',
        paneId:workerPaneId,
        primary:false,
        visible:true,
      },
    });
    expect(fixture.calls.at(-1)).toEqual(['agent','prompt',workerPaneId,prompt]);
  });

  it('accepts a live pane id as the closed target',async() => {
    const fixture = herdrFixture();
    const prompt = 'Inspect research.';

    const receipt = await deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt,
      target:researchPaneId,
    },fixture.runner);

    expect(receipt.target).toMatchObject({
      agent:'research_os_lead',
      paneId:researchPaneId,
      primary:false,
    });
    expect(fixture.calls.at(-1)).toEqual(['agent','prompt',researchPaneId,prompt]);
  });

  it('lists current agent panes for the combobox, excluding empty shells',async() => {
    const fixture = herdrFixture({
      agents:[
        agentFixture('xgc2_lead',primaryPaneId,'working'),
        agentFixture('xgc2_codex1',workerPaneId,'idle'),
      ],
      layoutPanes:fourByFourSplitPanes().map((pane) => (
        pane.pane_id === workerPaneId || pane.pane_id === primaryPaneId
          ? pane
          : { ...pane, agent:undefined,label:undefined }
      )),
    });

    const payload = await listMarkPromptTargets(fixture.runner);

    expect(payload).toMatchObject({
      schemaVersion:'xgc.mark-prompt-targets/v1',
      workspaceId,
      tabId,
    });
    expect(payload.targets.map((target) => target.paneLabel)).toEqual(['xgc2_lead','xgc2_codex1']);
    expect(payload.targets[0]).toMatchObject({
      paneId:primaryPaneId,kind:'codex',agentStatus:'working',primary:true,
    });
    expect(payload.targets[1]).toMatchObject({
      paneId:workerPaneId,kind:'codex',agentStatus:'idle',primary:false,
    });
  });

  it('does not treat a renamed primary as an implicit target',async() => {
    const fixture = herdrFixture({
      agents:[agentFixture('xgc2_lead_renamed',primaryPaneId,'working')],
      layoutPanes:fourByFourSplitPanes().map((pane) => (
        pane.pane_id === primaryPaneId ? { ...pane, label:'xgc2_lead_renamed' } : pane
      )),
    });

    await expect(resolveCurrentPrimaryAgent(fixture.runner))
      .rejects.toMatchObject({
        code:'target-unavailable',
        message:'The xgc2_lead lead could not be uniquely verified in the focused Herdr workspace; no prompt was sent.',
      });
  });

  it('fails closed when duplicate exact primary names are visible',async() => {
    const fixture = herdrFixture({
      agents:[
        agentFixture('xgc2_lead',primaryPaneId,'working'),
        agentFixture('xgc2_lead','workspace:worker-0-0','working'),
      ],
      layoutPanes:fourByFourSplitPanes().map((pane) => (
        pane.pane_id === workerPaneId ? { ...pane, label:'xgc2_lead',agent:'codex' } : pane
      )),
    });

    await expect(resolveCurrentPrimaryAgent(fixture.runner))
      .rejects.toMatchObject({ code:'primary-agent-ambiguous' });
  });

  it('rejects tokens, extra command-shaped fields, and malformed targets before invoking Herdr',async() => {
    const fixture = herdrFixture();
    await expect(deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Do the work.',
      target:'xgc2_codex1',
      token:'must-not-cross-the-browser-boundary',
    },fixture.runner)).rejects.toMatchObject({ code:'invalid-request' });
    await expect(deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Do the work.',
      target:'xgc2_lead; rm -rf /',
    },fixture.runner)).rejects.toMatchObject({ code:'invalid-request' });
    expect(fixture.runner).not.toHaveBeenCalled();
  });

  it('rejects a well-formed target that is not in the live pane inventory',async() => {
    const fixture = herdrFixture();
    await expect(deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Do the work.',
      target:'missing_agent',
    },fixture.runner)).rejects.toMatchObject({
      code:'target-unavailable',
      message:'The selected Herdr pane missing_agent is not in the focused workspace; no prompt was sent.',
    });
    expect(fixture.calls.some((args) => args[0] === 'agent' && args[1] === 'prompt')).toBe(false);
  });

  it('accepts only same-origin loopback browser requests with the closed bridge header',() => {
    expect(() => validateMarkPromptBrowserRequest({
      method:'POST',
      headers:{
        host:'127.0.0.1:5174',
        origin:'http://127.0.0.1:5174',
        'content-type':'application/json',
        'sec-fetch-site':'same-origin',
        'x-xgc-mark-prompt':'v1',
      },
    } as never)).not.toThrow();
    expect(() => validateMarkPromptTargetsRequest({
      method:'GET',
      headers:{
        host:'127.0.0.1:5174',
        origin:'http://127.0.0.1:5174',
        'sec-fetch-site':'same-origin',
        'x-xgc-mark-prompt':'v1',
      },
    } as never)).not.toThrow();
    expect(() => validateMarkPromptTargetsRequest({
      method:'GET',
      headers:{
        host:'127.0.0.1:5174',
        'x-xgc-mark-prompt':'v1',
      },
    } as never)).not.toThrow();

    for (const headers of [
      {
        host:'127.0.0.1:5174',
        origin:'http://malicious.example',
        'content-type':'application/json',
        'x-xgc-mark-prompt':'v1',
      },
      {
        host:'xgc.example:5174',
        origin:'http://xgc.example:5174',
        'content-type':'application/json',
        'x-xgc-mark-prompt':'v1',
      },
      {
        host:'127.0.0.1:5174',
        origin:'http://127.0.0.1:5174',
        'content-type':'application/json',
      },
    ]) {
      expect(() => validateMarkPromptBrowserRequest({ method:'POST',headers } as never))
        .toThrow();
    }
  });

  it('returns a typed blocked error without writing to the pane',async() => {
    const fixture = herdrFixture({ agentStatus:'blocked' });
    await expect(deliverMarkPromptCommand({
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Do the work.',
    },fixture.runner)).rejects.toMatchObject({ code:'target-blocked' });
    expect(fixture.calls.some((args) => args[0] === 'agent' && args[1] === 'prompt')).toBe(false);
  });

  it('keeps active-tab visibility as a guard without consulting pane geometry',async() => {
    const fixture = herdrFixture({ focusedTab:false });
    await expect(resolveCurrentPrimaryAgent(fixture.runner))
      .rejects.toMatchObject({ code:'target-not-visible' });
    expect(fixture.calls.some((args) => args[0] === 'pane' && args[1] === 'layout')).toBe(false);
  });

  it('returns a queued receipt from the bridge endpoint',async() => {
    const fixture = herdrFixture();
    const response = await invokeBridgeEndpoint(fixture.runner,{
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Queue this prompt.',
      target:'xgc2_lead',
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toMatchObject({
      status:'accepted',
      delivery:'queued',
      target:{ agent:'xgc2_lead',paneId:primaryPaneId,primary:true,visible:true },
    });
  });

  it('returns current panes from the targets endpoint',async() => {
    const fixture = herdrFixture();
    const response = await invokeBridgeEndpoint(fixture.runner,undefined,{
      method:'GET',
      url:'/__xgc/devtools/mark-prompt/targets',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      schemaVersion:'xgc.mark-prompt-targets/v1',
      workspaceId,
      tabId,
    });
    expect((response.body as { targets:{ paneLabel:string }[] }).targets.map((target) => target.paneLabel))
      .toEqual(expect.arrayContaining(['xgc2_lead','xgc2_codex1','research_os_lead']));
    expect(fixture.calls.some((args) => args[0] === 'agent' && args[1] === 'prompt')).toBe(false);
  });

  it.each(['server_not_running','ENOENT'])('reports known Herdr offline state %s without an HTTP failure',async(code) => {
    const fixture = herdrFixture();
    fixture.runner.mockRejectedValue({ code,message:'Herdr is offline.' });

    const response = await invokeBridgeEndpoint(fixture.runner,undefined,{
      method:'GET',url:'/__xgc/devtools/mark-prompt/targets',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      schemaVersion:'xgc.mark-prompt-targets-unavailable/v1',
      status:'unavailable',targets:[],fallback:'copy',
      error:{ code:'bridge-unavailable',message:expect.stringContaining('Copy remains available') },
    });
    expect(fixture.runner).toHaveBeenCalledExactlyOnceWith(['workspace','list']);

    fixture.runner.mockClear();
    const delivery = await invokeBridgeEndpoint(fixture.runner,{
      schemaVersion:'xgc.mark-prompt-command/v1',prompt:'Retain this prompt.',target:'xgc2_lead',
    });
    expect(delivery.statusCode).toBe(503);
    expect(delivery.body).toMatchObject({ status:'error',fallback:'copy' });
    expect(fixture.runner).toHaveBeenCalledExactlyOnceWith(['workspace','list']);
  });

  it('keeps unknown inventory failures and invalid requests as HTTP errors',async() => {
    const fixture = herdrFixture();
    fixture.runner.mockRejectedValue(new Error('Herdr returned a non-JSON response.'));
    const response = await invokeBridgeEndpoint(fixture.runner,undefined,{
      method:'GET',url:'/__xgc/devtools/mark-prompt/targets',
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ schemaVersion:'xgc.mark-prompt-targets-error/v1',status:'error' });

    fixture.runner.mockClear();
    const invalid = await invokeBridgeEndpoint(fixture.runner,undefined,{
      method:'GET',url:'/__xgc/devtools/mark-prompt/targets',headers:{ 'x-xgc-mark-prompt':'' },
    });
    expect(invalid.statusCode).toBe(403);
    expect(fixture.runner).not.toHaveBeenCalled();
  });

  it('rechecks live inventory through offline-online-offline-online delivery cycles',async() => {
    const fixture = herdrFixture();
    let online = false;
    const runner = vi.fn(async(args:string[]) => {
      if (!online) throw { code:'server_not_running',message:'Herdr is stopped.' };
      return fixture.runner(args);
    });
    const targetsRequest = { method:'GET',url:'/__xgc/devtools/mark-prompt/targets' };
    const command = { schemaVersion:'xgc.mark-prompt-command/v1',prompt:'Isolated fixture prompt.',target:'xgc2_codex1' };
    for (let cycle = 0; cycle < 2; cycle += 1) {
      expect((await invokeBridgeEndpoint(runner,undefined,targetsRequest)).body).toMatchObject({ status:'unavailable',targets:[] });
      const deliveredBefore = fixture.calls.filter((args) => args[1] === 'prompt').length;
      expect((await invokeBridgeEndpoint(runner,command)).statusCode).toBe(503);
      expect(fixture.calls.filter((args) => args[1] === 'prompt')).toHaveLength(deliveredBefore);
      online = true;
      expect((await invokeBridgeEndpoint(runner,undefined,targetsRequest)).body).toMatchObject({
        targets:expect.arrayContaining([expect.objectContaining({ paneId:workerPaneId })]),
      });
      expect((await invokeBridgeEndpoint(runner,command)).body).toMatchObject({ status:'accepted',target:{ paneId:workerPaneId } });
      expect(fixture.calls.at(-1)).toEqual(['agent','prompt',workerPaneId,command.prompt]);
      online = false;
    }
  });

  it('returns fallback copy when Herdr rejects the queued prompt',async() => {
    const fixture = herdrFixture({ promptError:{ code:'prompt_rejected',message:'queue closed' } });
    const response = await invokeBridgeEndpoint(fixture.runner,{
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Keep this prompt available.',
      target:'xgc2_codex1',
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      status:'error',
      error:{ code:'prompt-rejected',message:'queue closed' },
      fallback:'copy',
    });
    expect(fixture.calls.at(-1)).toEqual([
      'agent','prompt',workerPaneId,'Keep this prompt available.',
    ]);
  });

  it('returns a stable unavailable error when the selected pane disappears before prompt delivery',async() => {
    const fixture = herdrFixture({
      promptError:{ code:'agent_not_found',message:'transient agent lookup wording' },
    });
    const response = await invokeBridgeEndpoint(fixture.runner,{
      schemaVersion:'xgc.mark-prompt-command/v1',
      prompt:'Keep this prompt available.',
      target:'xgc2_lead',
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      status:'error',
      error:{
        code:'target-unavailable',
        message:'The selected Herdr pane xgc2_lead is no longer available; no prompt was sent.',
      },
      fallback:'copy',
    });
    expect(fixture.calls.at(-1)).toEqual([
      'agent','prompt',primaryPaneId,'Keep this prompt available.',
    ]);
  });
});
