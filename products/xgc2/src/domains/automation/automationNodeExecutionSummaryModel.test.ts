import { describe,expect,it } from 'vitest';
import { parseAutomationNodeExecutionSummaries } from './automationNodeExecutionSummaryModel';
const summary={runId:'run',nodeId:'observe',kind:'robot.operation-observe',status:'running',latestInvocationId:'invocation',occurrenceCount:1,activeOccurrenceCount:1,completedOccurrenceCount:0,failedOccurrenceCount:0,attemptCount:1,updatedAt:'2026-09-10T03:00:00Z',revision:2};
describe('safe node progress',()=>{
 it('accepts out-of-Action nodes without inventing an occurrence',()=>{
  const excluded={...summary,status:'skipped',latestInvocationId:undefined,occurrenceCount:0,activeOccurrenceCount:0,attemptCount:0,revision:0};
  expect(parseAutomationNodeExecutionSummaries([excluded],'summaries','run')[0]).toMatchObject({status:'skipped',occurrenceCount:0});
  expect(()=>parseAutomationNodeExecutionSummaries([{...excluded,status:'running'}],'summaries','run')).toThrow();
 });
 it('accepts an activated occurrence queued before its first attempt',()=>{
  const queued={...summary,status:'pending',attemptCount:0,revision:1};
  expect(parseAutomationNodeExecutionSummaries([queued],'summaries','run')[0]).toEqual(queued);
  expect(()=>parseAutomationNodeExecutionSummaries([{...queued,latestInvocationId:undefined}],'summaries','run')).toThrow();
 });
 it('preserves backend progress independently of completed output',()=>{
  const progress={rows:[{robotId:'uav1',status:'pending'}]};
  const [parsed]=parseAutomationNodeExecutionSummaries([{...summary,progress}],'summaries','run');
  expect(parsed.progress).toEqual(progress);expect(parsed.output).toBeUndefined();
 });
 it('does not admit a private checkpoint on the public wire',()=>{
  expect(()=>parseAutomationNodeExecutionSummaries([{...summary,checkpoint:{secret:'hidden'}}],'summaries','run')).toThrow();
 });
});
describe('node occurrence counters during compensation',() => {
  it.each([0,1])('accepts a completed invocation with active compensation and %i failed occurrence', (failedOccurrenceCount) => {
    const compensating={ ...summary,status:'compensating',completedOccurrenceCount:1,failedOccurrenceCount };
    expect(parseAutomationNodeExecutionSummaries([compensating],'summaries','run')).toEqual([compensating]);
  });
  it('accepts completed compensation without counting it as active',() => {
    const compensated={ ...summary,status:'compensated',activeOccurrenceCount:0,completedOccurrenceCount:1 };
    expect(parseAutomationNodeExecutionSummaries([compensated],'summaries','run')).toEqual([compensated]);
  });
  it.each(['pending','running','waiting','succeeded','failed','canceled','skipped','compensated'])(
    'rejects overlapping counters for non-compensating status %s', (status) => {
      expect(() => parseAutomationNodeExecutionSummaries(
        [{ ...summary,status,completedOccurrenceCount:1 }],'summaries','run',
      )).toThrow('inconsistent occurrence counters');
    },
  );
  it.each([
    { activeOccurrenceCount:2,completedOccurrenceCount:1,failedOccurrenceCount:0 },
    { activeOccurrenceCount:1,completedOccurrenceCount:2,failedOccurrenceCount:0 },
    { activeOccurrenceCount:1,completedOccurrenceCount:1,failedOccurrenceCount:2 },
    { activeOccurrenceCount:1,completedOccurrenceCount:0,failedOccurrenceCount:1 },
  ])('rejects out-of-bounds compensation counters %j', (counters) => {
    expect(() => parseAutomationNodeExecutionSummaries(
      [{ ...summary,status:'compensating',...counters }],'summaries','run',
    )).toThrow('inconsistent occurrence counters');
  });
});
