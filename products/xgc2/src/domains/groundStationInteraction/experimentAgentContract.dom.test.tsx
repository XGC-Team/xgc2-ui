// @vitest-environment jsdom
import { describe,expect,it,vi } from 'vitest';
import { render,screen,fireEvent } from '@testing-library/react';
import { decodeExperimentAgentAction,decodeAgentAdmission } from './experimentAgentContract';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import { GroundStationDecisionResponseControls } from './GroundStationDecisionResponse';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

const action = {
 schema:'xgc.experiment-agent-action/v1',delegationId:'ag_abc',conversationId:'conversation-a',targetId:'local',experimentId:'experiment-a',
 sessionId:'session-a',openingRunId:'opening-a',openingSnapshotDigest:'snapshot-digest',experimentCommitId:'commit-a',experimentDigest:'experiment-digest',robotSelectionDigest:'roster-digest',
 bundleDigest:'bundle-digest',automationId:'automation-a',automationCommitId:'automation-commit',actionId:'inspect',actionLabel:'Inspect sample',entrypointNodeId:'manual',entrypointVersion:1,
 parameters:{sample:3},requiredCapabilities:['automations.run'],requestDigest:'request-digest',sourceEventKey:'source-a',eventId:'event-a',runId:'run-a',
};
function fixture(patch:Record<string,unknown>={}) {
 return {schemaVersion:1,id:'proposal-a',targetScope:'local',revision:1,status:'open',kind:'decision',presentation:'panel',responseMode:'decision',severity:'warning',
 title:'Inspect sample',message:'Read before authorizing.',payload:{decision:{approveLabel:'Approve Action',rejectLabel:'Reject',requireReason:false,agentAction:action}},
 origin:{type:'experiment-agent',ref:'ag_abc',experimentId:'experiment-a'},audience:{scope:'all'},createdAt:'2026-09-07T00:00:00Z',updatedAt:'2026-09-07T00:00:00Z',expiresAt:'2099-09-07T00:00:00Z',...patch};
}
describe('controlled Action immutable review contract',()=>{
 it('decodes exact pinned parameters and refuses widened or malformed executable data',()=>{
  expect(decodeExperimentAgentAction(action)).toEqual(action);
  for(const patch of [{targetId:'remote'},{url:'https://untrusted.example/control'},{parameters:[]},{parameters:null},{requiredCapabilities:['automations.run','automations.run']},{entrypointVersion:1.5},{sessionId:' other'}]){
   expect(decodeExperimentAgentAction({...action,...patch})).toBeNull();
  }
  expect(decodeAgentAdmission({commandId:'c',eventId:'event-a',runId:'run-a',status:'succeeded'})).toBeNull();
 });
 it('never downgrades a malformed agent intent to ordinary approval',()=>{
  expect(decodeGroundStationInteraction(fixture())).toBeDefined();
  expect(decodeGroundStationInteraction(fixture({payload:{decision:{approveLabel:'Approve',rejectLabel:'Reject'}}}))).toBeUndefined();
  expect(decodeGroundStationInteraction(fixture({origin:{type:'automation',ref:'ag_abc',experimentId:'experiment-a'}}))).toBeUndefined();
  expect(decodeGroundStationInteraction(fixture({expiresAt:undefined}))).toBeUndefined();
 });
 it('requires an exact durable admission receipt, not a generic approved response',()=>{
  const response={action:'approved',actor:'station-main',at:'2026-09-07T00:01:00Z'};
  const resolved={status:'resolved',revision:2,updatedAt:response.at,resolvedAt:response.at};
  expect(decodeGroundStationInteraction(fixture({...resolved,response}))).toBeUndefined();
  const admission={commandId:'command-a',eventId:'event-a',runId:'run-a',status:'accepted'};
  expect(decodeGroundStationInteraction(fixture({...resolved,response:{...response,admission}}))).toBeDefined();
  expect(decodeGroundStationInteraction(fixture({...resolved,response:{...response,admission:{...admission,runId:'other'}}}))).toBeUndefined();
 });
 it('shows the action and exact parameters without exposing internal admission identifiers',()=>{
  const interaction=decodeGroundStationInteraction(fixture()) as GroundStationDecisionInteraction;
  const respond=vi.fn(async()=>interaction);
  render(<GroundStationDecisionResponseControls interaction={interaction} appearance="dialog" onRespond={respond}/>);
  const review=screen.getByRole('region',{name:'Frozen Action review'});
  expect(review).toHaveTextContent('Inspect sample');expect(review).toHaveTextContent('"sample": 3');
  for (const internal of ['session-a','automations.run','snapshot-digest','request-digest']) expect(review).not.toHaveTextContent(internal);
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Approve Action'}));
  expect(respond).toHaveBeenCalledExactlyOnceWith(interaction,'approved',{});
 });
});
