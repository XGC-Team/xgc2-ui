import { describe,expect,it } from 'vitest';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import { projectLichtblickStartup } from './lichtblickStartupPipeline';

describe('projectLichtblickStartup',() => {
  it('keeps idle stages when the Panel Workflow is stopped',() => {
    expect(projectLichtblickStartup({ phase:'stopped',runActive:false }).stages.map((stage) => stage.status))
      .toEqual(['idle','idle','idle']);
  });

  it('keeps viewer and bridge pending until those processes exist',() => {
    expect(projectLichtblickStartup({ phase:'starting',runActive:true }).stages.map((stage) => [stage.id,stage.status]))
      .toEqual([['run','ready'],['viewer','pending'],['bridge','pending']]);
  });

  it('lights run then waits on viewer and bridge while starting',() => {
    const projected = projectLichtblickStartup({
      phase:'starting',runActive:true,viewer:process('lichtblick-web','starting'),
    });
    expect(projected.stages.map((stage) => [stage.id,stage.status])).toEqual([
      ['run','ready'],
      ['viewer','active'],
      ['bridge','pending'],
    ]);
  });

  it('puts runtime fetch failures on the run stage title, not a visible body fact',() => {
    const projected = projectLichtblickStartup({
      phase:'starting',runActive:false,runtimeError:'Failed to fetch',
    });
    expect(projected.stages[0]).toMatchObject({ id:'run',status:'failed',detail:'Failed to fetch' });
    expect(projected.stages[0]?.identity).toBeUndefined();
  });
});

function process(definitionId: string,observedState: ProcessInstance['observedState']): ProcessInstance {
  return {
    id:`process-${definitionId}`,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'digest',
    ownerType:'orchestration-run',ownerId:'run-1',scope:'run',parameters:{},driver:'host',
    desiredState:'running',observedState,readiness:{ status:'unknown' },liveness:{ status:'unknown' },
    revision:1,restartCount:0,createdAt:'t',updatedAt:'t',
  };
}
