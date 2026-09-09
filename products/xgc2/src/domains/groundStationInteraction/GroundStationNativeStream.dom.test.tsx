// @vitest-environment jsdom
import { act,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { useNativeStream,type NativeStreamTransport } from '@xgc2/native-agent/react';
import { NATIVE_SCHEMA,type NativeSession } from '@xgc2/native-agent/state';

const session: NativeSession = { schemaVersion: NATIVE_SCHEMA,id: 's_default',provider: 'codex',state: 'ready',createdAt: '2026-09-06T00:00:00Z',lastSeq: 0,title:'',archived:false,metadataRevision:1,
  scope: { profileId: 'codex',context: { kind: 'research-project',id: 'project-one' },workspace: { id: 'workspace-one',revision: 'fixture' },nativeAccessConfirmed: true } };
class EventSourceFixture {
  static instances: EventSourceFixture[] = [];
  close = vi.fn();
  onopen?: () => void;
  onerror?: () => void;
  listener?: (message: MessageEvent<string>) => void;
  constructor(readonly url: string) { EventSourceFixture.instances.push(this); }
  addEventListener(type: string,listener: (message: MessageEvent<string>) => void) { if (type === 'native-agent') this.listener = listener; }
}
function Projection({ openStream }: { openStream?: NativeStreamTransport }) {
  const projection = useNativeStream(session,0,{ basePath: '/api/v1/native-agents',openStream });
  return <><output data-testid="native-text">{projection.state.items.map((item) => item.text).join('|')}</output><span data-testid="native-error">{projection.error}</span></>;
}
describe('shared native stream default and injected transports',() => {
  beforeEach(() => { EventSourceFixture.instances = []; vi.stubGlobal('EventSource',EventSourceFixture); });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the Research default EventSource path and accumulated event semantics',async () => {
    const view = render(<Projection />);
    const source = EventSourceFixture.instances[0];
    expect(source.url).toBe('/api/v1/native-agents/sessions/s_default/events?after=0');
    await act(async () => {
      source.listener?.(new MessageEvent('native-agent',{ data: JSON.stringify({ schemaVersion: NATIVE_SCHEMA,sessionId: session.id,provider: 'codex',seq: 1,kind: 'item.delta',turnId: 't_one',itemId: 'message',role: 'assistant',text: 'Native output' }) }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(screen.getByTestId('native-text')).toHaveTextContent('Native output');
    view.unmount();
    expect(source.close).toHaveBeenCalledTimes(1);
  });
  it('fails malformed default events closed instead of fabricating a reply',() => {
    render(<Projection />);
    const source = EventSourceFixture.instances[0];
    act(() => source.listener?.(new MessageEvent('native-agent',{ data: '{' })));
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('native-error').textContent).not.toBe('');
    expect(screen.getByTestId('native-text')).toBeEmptyDOMElement();
  });
  it('closes an injected stream even when it reports invalid data synchronously during opening',() => {
    const close = vi.fn();
    const openStream: NativeStreamTransport = (options) => { options.onInvalid(new Error('Invalid native stream')); return { close }; };
    render(<Projection openStream={openStream} />);
    expect(screen.getByTestId('native-error')).toHaveTextContent('Invalid native stream');
    expect(close).toHaveBeenCalledTimes(1);
    expect(EventSourceFixture.instances).toHaveLength(0);
  });
});
