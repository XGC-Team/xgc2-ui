// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import { listMarkPromptTargets } from './markPromptCommandService';

const unavailable = {
  schemaVersion:'xgc.mark-prompt-targets-unavailable/v1',
  status:'unavailable',
  targets:[],
  error:{ code:'bridge-unavailable',message:'Herdr is not running. Copy remains available.' },
  fallback:'copy',
};

describe('Mark Prompt target availability',() => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains the known offline reason from a successful availability read',async() => {
    vi.stubGlobal('fetch',vi.fn(async() => new Response(JSON.stringify(unavailable),{
      status:200,headers:{ 'Content-Type':'application/json' },
    })));
    await expect(listMarkPromptTargets()).rejects.toMatchObject({
      code:'bridge-unavailable',message:unavailable.error.message,
    });
  });

  it('rejects an unavailable payload that also claims a deliverable target',async() => {
    vi.stubGlobal('fetch',vi.fn(async() => new Response(JSON.stringify({
      ...unavailable,
      targets:[{ paneId:'pane',paneLabel:'lead',kind:'codex',agentStatus:'idle',primary:true }],
    }),{ status:200,headers:{ 'Content-Type':'application/json' } })));
    await expect(listMarkPromptTargets()).rejects.toMatchObject({ code:'invalid-response' });
  });
});
