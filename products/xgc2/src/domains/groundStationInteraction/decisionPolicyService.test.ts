// @vitest-environment jsdom
import { describe,expect,it } from 'vitest';
import type { DecisionFacts } from '@xgc2/native-agent/client';
import { decisionModeForScope,type DecisionPolicy,type DecisionRule } from './decisionPolicyService';

const now=Date.parse('2026-09-08T01:00:00Z');
const nativeFacts:DecisionFacts={operation:'native.file.read',experimentId:'experiment-a',conversationId:'conversation-a',
  workspace:{id:'project',revision:'r1'},targetId:'local',parametersDigest:'a'.repeat(64)};
function rule(id:string,mode:DecisionRule['mode'],overrides:Partial<DecisionRule>={}):DecisionRule {
  return {id,mode,scope:nativeFacts,issuedAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+240_000).toISOString(),remainingUses:3,...overrides};
}
function policy(rules:DecisionRule[]):DecisionPolicy {
  return {id:'dp_fixture',revision:'4',actor:{id:'operator'},rules};
}

describe('decisionModeForScope',() => {
  it('shows the active persisted exact-scope rule using backend priority',() => {
    expect(decisionModeForScope(policy([rule('allow','auto')]),nativeFacts,now)).toBe('auto');
    expect(decisionModeForScope(policy([rule('allow','auto'),rule('review','manual'),rule('block','deny')]),nativeFacts,now)).toBe('deny');
  });

  it('does not display rules the backend cannot apply',() => {
    const wrong={...nativeFacts,parametersDigest:'b'.repeat(64)};
    expect(decisionModeForScope(policy([
      rule('expired','auto',{expiresAt:new Date(now).toISOString()}),
      rule('exhausted','deny',{remainingUses:0}),
      rule('future','auto',{issuedAt:new Date(now+1).toISOString(),expiresAt:new Date(now+60_000).toISOString()}),
      rule('wrong-scope','deny',{scope:wrong}),
      rule('overlong','auto',{issuedAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+3_600_000).toISOString()}),
    ]),nativeFacts,now)).toBe('manual');
    expect(decisionModeForScope(policy([rule('allow','auto')]),null,now)).toBe('manual');
  });

  it('uses the backend five-minute lifetime for GCS policy rules',() => {
    const gcsFacts:DecisionFacts={operation:'gcs.workflow.confirm',experimentId:'experiment-a',conversationId:'',workspace:{id:'',revision:''},
      experimentSessionId:'session-a',targetId:'local',parametersDigest:'c'.repeat(64)};
    const allowed=rule('gcs-allow','auto',{scope:gcsFacts,issuedAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+240_000).toISOString()});
    const overlong=rule('gcs-overlong','auto',{scope:gcsFacts,issuedAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+300_000).toISOString()});
    expect(decisionModeForScope(policy([allowed]),gcsFacts,now)).toBe('auto');
    expect(decisionModeForScope(policy([overlong]),gcsFacts,now)).toBe('manual');
  });
});
