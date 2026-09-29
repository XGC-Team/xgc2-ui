// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act,cleanup,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { ProductWebComposition } from '../shared/productWebComposition';
import type { OperatorIdentity } from '../domains/operatorAccess/operatorAccessPublic';
import { ProductWebEntry } from './ProductWebEntry';
import { PRODUCT_WEB_BOOTSTRAP_ROLE,productWebBootstrapIsLoading } from './productWebBootstrap';

// The station shell never gates on the operator identity; a background probe
// only confirms the request transport for already signed-in browsers.
const identity: OperatorIdentity = { authenticated: true,transport: 'operator-cookie',stationId: 'operator',name: 'Operator',role: 'owner',capabilities: ['core.view'],visibleCores: ['local'],canPair: false };
function identityResponse(body: unknown = identity,status = 200) {
  return new Response(JSON.stringify(body),{ status });
}

vi.mock('../App',() => ({ App: () => <div>normal station mounted</div> }));
vi.mock('../domains/access/entry/AccessEntryPage',() => ({ AccessEntryPage: () => <div>restricted entry mounted</div> }));
vi.mock('../domains/operatorAccess/operatorAccessPublic',async () => ({
  ...(await import('../domains/operatorAccess/operatorAccessPublic')),
  OperatorPairPage: () => <div>anonymous pairing mounted</div>,
}));

const preload = vi.fn(async () => undefined);
const composition: ProductWebComposition = {
  id: 'entry-test',agentLinkComputeTargets: false,
  routes: [{
    page: 'experiment',component: () => null,preload,
    surface: { productFeatures: [],targetAction: 'view',targetCapabilities: [],remoteVisibility: 'local-only',remoteManagedHostAdmission: () => false },
  }],
  navigation: { defaultPage: 'experiment',primary: [],operations: [],sections: {},sectionDefaults: {} },
  settings: { sections: [] },developer: {},
};

describe('product authentication entry routing',() => {
  beforeEach(() => {
    vi.clearAllMocks();window.history.replaceState(null,'','/');
    window.localStorage.clear();
    vi.stubGlobal('fetch',vi.fn(async () => identityResponse()));
    const bootstrap = document.createElement('div');
    bootstrap.dataset.xgcRole = PRODUCT_WEB_BOOTSTRAP_ROLE;
    bootstrap.setAttribute('role','status');
    document.body.appendChild(bootstrap);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.querySelector(`[data-xgc-role="${PRODUCT_WEB_BOOTSTRAP_ROLE}"]`)?.remove();
  });

  it.each([
    ['/operator-pair#token=once','anonymous pairing mounted'],
    ['/access-entry#token=once','restricted entry mounted'],
  ])('does not mount or preload the main station for %s',async (path,text) => {
    window.history.replaceState(null,'',path);
    render(<StrictMode><ProductWebEntry composition={composition} /></StrictMode>);
    await screen.findByText(text);
    expect(fetch).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
    expect(screen.queryByText('normal station mounted')).toBeNull();
    expect(productWebBootstrapIsLoading()).toBe(false);
  });

  it('mounts the station immediately and only probes the identity in the background',async () => {
    render(<StrictMode><ProductWebEntry composition={composition} /></StrictMode>);
    await screen.findByText('normal station mounted');
    expect(preload).toHaveBeenCalled();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/access/sessions/current',expect.objectContaining({ credentials: 'include' })));
    expect(document.querySelector('[data-xgc-role="operator-station-gate"]')).toBeNull();
    // The App mock registers no route-readiness deferral, so mounting the
    // station dismisses the bootstrap straight away; nothing waits on identity.
    expect(productWebBootstrapIsLoading()).toBe(false);
  });

  it('mounts the station when the session authority answers 401',async () => {
    vi.mocked(fetch).mockImplementation(async () => identityResponse({ error: 'unauthorized' },401));
    render(<StrictMode><ProductWebEntry composition={composition} /></StrictMode>);
    await screen.findByText('normal station mounted');
    expect(preload).toHaveBeenCalled();
    expect(screen.queryByText('This browser is not signed in')).toBeNull();
    expect(document.querySelector('[data-xgc-role="operator-station-gate"]')).toBeNull();
  });

  it('mounts the station when the session authority is unreachable',async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network down'));
    render(<StrictMode><ProductWebEntry composition={composition} /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    await screen.findByText('normal station mounted');
    expect(preload).toHaveBeenCalled();
  });
});
