import type { FunctionComponent,ReactElement } from 'react';
import { describe,expect,it } from 'vitest';
import { AutomationsRoute } from './AutomationsRoute';
import { createAutomationsRoute } from './createAutomationsRoute';
import {
  composeAutomationNodeWeb,
  emptyAutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';
import { mediaCaptureSnapshotContribution } from './nodes/media/mediaCaptureSnapshotContribution';

describe('createAutomationsRoute', () => {
  it('returns a zero-props route that preserves the exact frozen composition', () => {
    const composition = composeAutomationNodeWeb(mediaCaptureSnapshotContribution);
    const Route = createAutomationsRoute(composition) as FunctionComponent;

    expect(Route.length).toBe(0);
    expect(Route.displayName).toBe('ProductAutomationsRoute');
    const rendered = Route({}) as ReactElement<{ nodeComposition: typeof composition }>;
    expect(rendered.type).toBe(AutomationsRoute);
    expect(rendered.props.nodeComposition).toBe(composition);
    expect(Object.isFrozen(rendered.props.nodeComposition)).toBe(true);
  });

  it('passes a synthetic empty composition without attaching a concrete adapter', () => {
    const composition = emptyAutomationNodeWebComposition();
    const Route = createAutomationsRoute(composition) as FunctionComponent;
    const rendered = Route({}) as ReactElement<{ nodeComposition: typeof composition }>;

    expect(rendered.props.nodeComposition).toBe(composition);
    expect(rendered.props.nodeComposition.contributions).toEqual([]);
  });
});
