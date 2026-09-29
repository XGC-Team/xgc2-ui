import { strict as assert } from 'node:assert';
import { describe,it } from 'vitest';
import type { ExperimentSessionView } from './experimentWorkflowModel';
import { retainExperimentSessionViews } from './experimentSessionObservation';

function views():ExperimentSessionView[] {
  return [{
    session:{
      id:'session-a',targetId:'local',experimentResourceId:'experiment-a',
      state:'active',mode:'full',runMode:'simulation',revision:4,
    },
    members:[{
      id:'member-a',targetId:'local',sessionId:'session-a',bindingId:'panel-a',
      kind:'workflow_run',ownerId:'run-a',status:'running',revision:2,
    }],
  }];
}

describe('Experiment Session snapshot identity',() => {
  it('reuses only equal authoritative content, without modifying either input',() => {
    const previous=views();
    const incoming=views();
    const before=JSON.stringify(incoming);
    assert.equal(retainExperimentSessionViews(previous,incoming),previous);
    assert.equal(JSON.stringify(incoming),before);
    assert.equal(retainExperimentSessionViews(previous,previous),previous);
    const empty:ExperimentSessionView[]=[];
    assert.equal(retainExperimentSessionViews(empty,[]),empty);
  });

  it('publishes member changes even when the aggregate Session revision is unchanged',() => {
    const previous=views();
    const incoming=views();
    incoming[0].members[0].status='stopping';
    incoming[0].members[0].revision+=1;
    assert.equal(incoming[0].session.revision,previous[0].session.revision);
    assert.equal(retainExperimentSessionViews(previous,incoming),incoming);
  });

  it('publishes membership, owner, binding, order, and Session lifecycle changes',() => {
    const changes:((value:ExperimentSessionView[]) => void)[]=[
      (value) => { value[0].members=[]; },
      (value) => { value[0].members.push({ ...value[0].members[0],id:'member-b',ownerId:'run-b' }); },
      (value) => { value[0].members[0].ownerId='run-new'; },
      (value) => { value[0].members[0].bindingId='panel-new'; },
      (value) => { value[0].session.state='stopping'; },
      (value) => { value[0].session.experimentCommitId='different-pin'; },
      (value) => { value[0].session.targetId='other-target'; },
    ];
    const previous=views();
    for (const change of changes) {
      const incoming=views();
      change(incoming);
      assert.equal(retainExperimentSessionViews(previous,incoming),incoming);
    }
    const two=[...views(),{ ...views()[0],session:{ ...views()[0].session,id:'session-b' } }];
    const reversed=[...two].reverse();
    assert.equal(retainExperimentSessionViews(two,reversed),reversed);
    assert.notEqual(retainExperimentSessionViews(previous,[]),previous);
  });

  it('compares additional wire fields and nested content, regardless of object key order',() => {
    const previous=views().map((view) => ({
      ...view,
      session:{ ...view.session,error:'',metadata:{ progress:1,owner:'a' } },
    }));
    const reordered=views().map((view) => ({
      members:view.members,
      session:{ metadata:{ owner:'a',progress:1 },error:'',...view.session },
    }));
    assert.equal(retainExperimentSessionViews(previous,reordered),previous);
    reordered[0].session.metadata.progress=2;
    assert.equal(retainExperimentSessionViews(previous,reordered),reordered);
    const errorChanged=views().map((view) => ({ ...view,session:{ ...view.session,error:'failure' } }));
    assert.equal(retainExperimentSessionViews(previous,errorChanged),errorChanged);
    const absent=views();
    assert.equal(retainExperimentSessionViews(previous,absent),absent);
  });
});
