// @vitest-environment jsdom
import { beforeEach,describe,expect,it } from 'vitest';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import { bindAgentConversationDecisions,agentConversationDecisions } from './agentConversationDecisions';

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

function agentConfirm(conversationId:string): GroundStationDecisionInteraction {
  return {
    ...operatorConfirm('agent-inspect','Inspect sample','open'),
    origin: { type: 'experiment-agent',ref: 'ag_abc',experimentId: 'experiment-a' },
    payload: { decision: { approveLabel: 'Approve Action',rejectLabel: 'Reject',requireReason: false,agentAction: {
      schema: 'xgc.experiment-agent-action/v1',delegationId: 'ag_abc',conversationId,targetId: 'local',
      experimentId: 'experiment-a',sessionId: 'session-a',openingRunId: 'opening-a',
      openingSnapshotDigest: 'snapshot-digest',experimentCommitId: 'commit-a',experimentDigest: 'experiment-digest',
      robotSelectionDigest: 'roster-digest',bundleDigest: 'bundle-digest',automationId: 'automation-a',
      automationCommitId: 'automation-commit',actionId: 'inspect',actionLabel: 'Inspect sample',
      entrypointNodeId: 'manual',entrypointVersion: 1,parameters: {},requiredCapabilities: ['automations.run'],
      requestDigest: 'request-digest',sourceEventKey: 'source-a',eventId: 'event-a',runId: 'run-a',
    } } },
  };
}

describe('native conversation decision isolation',() => {
  beforeEach(() => { localStorage.clear(); });

  it('does not claim resolved Set mode/Arm receipts onto a blank draft',() => {
    const setMode = operatorConfirm('set-mode','Confirm Set mode');
    const arm = operatorConfirm('arm','Confirm Arm');
    expect(agentConversationDecisions('experiment-a',[setMode,arm],'draft:new')).toEqual([]);
    expect(agentConversationDecisions('experiment-a',[setMode,arm],'draft:another')).toEqual([]);
  });

  it('pins resolved operator receipts to an existing session and keeps a new conversation empty',() => {
    const setMode = operatorConfirm('set-mode','Confirm Set mode');
    const arm = operatorConfirm('arm','Confirm Arm');
    expect(agentConversationDecisions('experiment-a',[setMode,arm],'session-a').map(item => item.id)).toEqual(['set-mode','arm']);
    expect(agentConversationDecisions('experiment-a',[setMode,arm],'session-b')).toEqual([]);
    expect(agentConversationDecisions('experiment-a',[setMode,arm],'draft:new')).toEqual([]);
  });

  it('pins an open operator confirm to the visible conversation and keeps the receipt after approval',() => {
    const open = operatorConfirm('arm','Confirm Arm','open');
    expect(agentConversationDecisions('experiment-a',[open],'draft:one').map(item => item.id)).toEqual(['arm']);
    const resolved = operatorConfirm('arm','Confirm Arm');
    expect(agentConversationDecisions('experiment-a',[resolved],'draft:one').map(item => item.id)).toEqual(['arm']);
    expect(agentConversationDecisions('experiment-a',[resolved],'draft:two')).toEqual([]);
  });

  it('keeps agent-action confirms on their own conversation',() => {
    const item = agentConfirm('conversation-a');
    expect(agentConversationDecisions('experiment-a',[item],'conversation-a')).toEqual([item]);
    expect(agentConversationDecisions('experiment-a',[item],'conversation-b')).toEqual([]);
    expect(agentConversationDecisions('experiment-a',[item],'draft:new')).toEqual([]);
  });

  it('moves draft-stamped operator receipts onto the created CLI session',() => {
    const open = operatorConfirm('arm','Confirm Arm','open');
    agentConversationDecisions('experiment-a',[open],'draft:one');
    bindAgentConversationDecisions('experiment-a','draft:one','session-a');
    expect(agentConversationDecisions('experiment-a',[open],'session-a').map(item => item.id)).toEqual(['arm']);
    expect(agentConversationDecisions('experiment-a',[open],'draft:one')).toEqual([]);
  });

  it('returns nothing without a conversation identity',() => {
    expect(agentConversationDecisions('experiment-a',[operatorConfirm('arm','Confirm Arm')])).toEqual([]);
    expect(agentConversationDecisions('',[operatorConfirm('arm','Confirm Arm')],'session-a')).toEqual([]);
  });
});
