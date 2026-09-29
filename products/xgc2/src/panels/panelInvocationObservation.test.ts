import { describe,expect,it } from 'vitest';
import { newestPanelInvocation } from './panelInvocationObservation';
import type { PanelActionInvocation } from './types';

const accepted: PanelActionInvocation = { id:'own',status:'accepted',revision:1 };

describe('exact accepted Panel invocation observation',() => {
  it('does not require a current-head projection to consume its own terminal Run',() => {
    expect(newestPanelInvocation(accepted,{ id:'own',status:'succeeded',revision:4 }))
      .toEqual({ id:'own',status:'succeeded',revision:4 });
  });
  it('never adopts another command, regardless of its revision',() => {
    expect(newestPanelInvocation(accepted,{ id:'other',status:'rejected',revision:100 })).toEqual(accepted);
  });
  it('does not regress when an older snapshot arrives after SSE',() => {
    const terminal: PanelActionInvocation = { id:'own',status:'stopped',revision:8 };
    expect(newestPanelInvocation(accepted,terminal,{ id:'own',status:'running',revision:2 })).toEqual(terminal);
  });
  it('does not restore an unaccepted invocation from unrelated history',() => {
    expect(newestPanelInvocation(undefined,accepted)).toBeUndefined();
  });
});
