import { request } from '../../api/http';
import { executionTargetPath,executionTargetResourceId,type ExecutionEventCursor } from '../execution/executionPublic';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { objectWithKnownKeys } from './automationExecutionValidation';
import { parseAutomationRun } from './automationRunRecordModel';
import { parseAutomationNodeExecutionSummaries } from './automationNodeExecutionSummaryModel';
import { parseAutomationExecutionRelations } from './automationRelationsModel';

export type AutomationRunObservation = Required<Pick<AutomationRunDetail,'run'|'nodeSummaries'|'relations'>>;
export type AutomationObservationBundle = { items:AutomationRunObservation[];cursor:ExecutionEventCursor };

export async function getAutomationObservations(targetId:string,rootRunIds:readonly string[],signal:AbortSignal):Promise<AutomationObservationBundle> {
  const query=new URLSearchParams();
  rootRunIds.forEach((id) => query.append('rootRunId',id));
  const path=`${executionTargetPath(targetId)}/orchestration-observations?${query}`;
  const value=objectWithKnownKeys(await request<unknown>(path,{ signal }),new Set(['items','cursor']),path);
  if (!Array.isArray(value.items) || value.items.length>1024) throw new Error('Invalid Automation observation items.');
  const cursor=objectWithKnownKeys(value.cursor,new Set(['streamId','latestOffset']),`${path}.cursor`);
  if (typeof cursor.streamId!=='string' || !cursor.streamId
    || !Number.isSafeInteger(cursor.latestOffset) || (cursor.latestOffset as number)<0) {
    throw new Error('Invalid Automation observation cursor.');
  }
  const expectedTarget=executionTargetResourceId(targetId);
  const items=value.items.map((raw,index) => {
    const at=`${path}.items[${index}]`;
    const item=objectWithKnownKeys(raw,new Set(['run','nodeSummaries','relations']),at);
    const run=parseAutomationRun(item.run,`${at}.run`);
    if (run.targetId!==expectedTarget) throw new Error('Automation observation target mismatch.');
    return {
      run,
      nodeSummaries:parseAutomationNodeExecutionSummaries(item.nodeSummaries,`${at}.nodeSummaries`,run.id),
      relations:parseAutomationExecutionRelations(item.relations,`${at}.relations`,run.id,expectedTarget),
    };
  });
  const byId=new Map(items.map((item) => [item.run.id,item]));
  if (byId.size!==items.length) throw new Error('Duplicate Automation observation Run.');
  const reached=new Set<string>();
  const queue=[...rootRunIds];
  while (queue.length>0) {
    const id=queue.pop()!;
    if (reached.has(id)) continue;
    const item=byId.get(id);
    if (!item) throw new Error('Automation observation omitted a bound Run.');
    reached.add(id);
    item.relations.childRuns.forEach((child) => {
      if (child.boundAt && !child.launchAbandonedAt && !child.targetRoot
        && child.relation!=='detached' && child.targetId===expectedTarget) queue.push(child.childRunId);
    });
  }
  if (reached.size!==items.length) throw new Error('Automation observation contains an unrelated Run.');
  return { items,cursor:{ streamId:cursor.streamId,latestOffset:cursor.latestOffset as number } };
}
