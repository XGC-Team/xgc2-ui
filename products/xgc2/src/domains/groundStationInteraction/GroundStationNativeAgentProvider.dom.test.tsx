// @vitest-environment jsdom

import { render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { emptyStream,type NativeSession,type StreamState } from '@xgc2/native-agent/state';
import type * as NativeAgentServiceModule from './groundStationNativeAgentService';
import {
  GroundStationNativeAgentProvider,
  useGroundStationNativeAgentRegistry,
  useGroundStationNativeStreamFocus,
  type GroundStationNativeBinding,
} from './GroundStationNativeAgentProvider';

const native = vi.hoisted(() => ({
  state: undefined as StreamState | undefined,
  connection: 'connected',
  error: '',
  getNativeSessionPage: vi.fn(),
}));

vi.mock('@xgc2/native-agent/react', () => ({
  // The shared hook returns a fresh wrapper on every render, even if all
  // three values are unchanged. Registry projection must not loop on it.
  useNativeStream: () => ({ state: native.state,connection: native.connection,error: native.error }),
}));

vi.mock('./groundStationNativeAgentService', async (importOriginal) => ({
  ...await importOriginal<typeof NativeAgentServiceModule>(),
  createGroundStationNativeClient: () => ({ getNativeSessionPage: native.getNativeSessionPage }),
}));

vi.mock('../../api/http',() => ({ request:vi.fn(async () => ({data:{sessions:[],revision:'empty'}})) }));

const session: NativeSession = {
  schemaVersion: 'xgc.native-agent/v1',id: 'session-a',provider: 'codex',state: 'ready',
  createdAt: '2026-09-06T00:00:00Z',lastSeq: 0,title:'',archived:false,metadataRevision:1,
  scope: {
    profileId: 'codex-local',context: { kind: 'experiment',id: 'exp-a' },
    workspace: { id: 'workspace-a',revision: 'reviewed' },nativeAccessConfirmed: true,
  },
};

let observed: GroundStationNativeBinding['projection'];

function RegistryProbe() {
  observed = useGroundStationNativeAgentRegistry()?.bindings[0]?.projection;
  return <output>{observed ? `${observed.state.cursor} / ${observed.connection} / ${observed.error}` : 'unavailable'}</output>;
}

function StreamFocus({ experimentId }: { experimentId: string }) {
  useGroundStationNativeStreamFocus(experimentId,true);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  observed = undefined;
  native.state = emptyStream(session.id,'codex');
  native.connection = 'connected';
  native.error = '';
  native.getNativeSessionPage.mockResolvedValue({sessions:[session]});
  window.localStorage.setItem('xgc.ground-station.native-agent.bindings.v1',JSON.stringify({
    version: 1,bindings: [{ experimentId: 'exp-a',sessionId: session.id }],
  }));
});

afterEach(() => window.localStorage.clear());

describe('Native Agent stream projection', () => {
  it('retains an unchanged projection across parent renders and propagates real stream changes', async () => {
    const surface = () => <GroundStationNativeAgentProvider executionTargetId="local"><StreamFocus experimentId="exp-a" /><RegistryProbe /></GroundStationNativeAgentProvider>;
    const view = render(surface());
    await screen.findByText('0 / connected /');
    const initial = observed;

    view.rerender(surface());
    expect(observed).toBe(initial);
    expect(native.getNativeSessionPage).toHaveBeenCalledTimes(1);

    native.state = { ...native.state!,cursor: 1,worker: 'ready' };
    view.rerender(surface());
    await waitFor(() => expect(observed?.state.cursor).toBe(1));
    expect(observed).not.toBe(initial);

    native.connection = 'disconnected';
    native.error = 'stream unavailable';
    view.rerender(surface());
    await screen.findByText('1 / disconnected / stream unavailable');
    expect(native.getNativeSessionPage).toHaveBeenCalledTimes(1);
  });
});
