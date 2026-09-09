// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  automationDocumentHash,
  automationDocumentListHash,
  canonicalAutomationHash,
  isAutomationLocationHash,
  isCurrentTargetAutomationListHash,
  retargetAutomationHash,
  resourceIdFromAutomationHash,
} from './automationNavigation';

describe('Automation route identity', () => {
  it('round-trips stable configuration resource IDs independently of runtime definitions', () => {
    const hash = automationDocumentHash('agent/east', 'automation/mission alpha');
    expect(hash).toBe('#/automations/agent%2Feast/workflows/automation%2Fmission%20alpha');
    expect(resourceIdFromAutomationHash(hash, 'agent/east')).toBe('automation/mission alpha');
    expect(resourceIdFromAutomationHash(hash, 'agent/west')).toBe('');
  });

  it('keeps list and malformed hashes out of the document selector', () => {
    expect(automationDocumentListHash('local')).toBe('#/automations/local/workflows');
    expect(resourceIdFromAutomationHash('#/automations/local/workflows', 'local')).toBe('');
    expect(resourceIdFromAutomationHash('#/automations/%E0%A4%A/workflows/a', 'local')).toBe('');
    expect(isAutomationLocationHash('#/automations/local/workflows/mission-a')).toBe(true);
    expect(isAutomationLocationHash('#/experiments/exp-1')).toBe(false);
  });

  it('canonicalizes invalid owned detail locations to the target workflow list', () => {
    expect(canonicalAutomationHash('#/automations/local/workflows/%E0%A4%A', 'local'))
      .toBe('#/automations/local/workflows');
    expect(canonicalAutomationHash('#/automations/local/workflows/a/extra', 'local'))
      .toBe('#/automations/local/workflows');
    expect(canonicalAutomationHash('#/automations/agent/workflows/a', 'local'))
      .toBe('#/automations/agent/workflows/a');
    expect(isCurrentTargetAutomationListHash('#/automations/local/workflows', 'local')).toBe(true);
    expect(isCurrentTargetAutomationListHash('#/automations/local/workflows/a', 'local')).toBe(false);
    expect(isCurrentTargetAutomationListHash('#/automations/agent/workflows/a', 'local')).toBe(false);
  });

  it('atomically retargets deep links without carrying workflow identity across Agents', () => {
    expect(retargetAutomationHash(
      '#/automations/xgc2-dev-lab-agent-mocap-rotor/workflows/rotor-start',
      'xgc2-dev-lab-agent-b2',
    )).toBe('#/automations/xgc2-dev-lab-agent-b2/workflows');
    expect(retargetAutomationHash(
      '#/automations/xgc2-dev-lab-agent-mocap-rotor/workflows/rotor-start',
      'xgc2-dev-lab-agent-mocap-rotor',
    )).toBe('#/automations/xgc2-dev-lab-agent-mocap-rotor/workflows/rotor-start');
    expect(retargetAutomationHash('#/settings', 'xgc2-dev-lab-agent-b2')).toBe('#/settings');
  });
});
