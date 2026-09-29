import type { AutomationNodeExecutionSummary,AutomationRunDetail } from '../../domains/automation/automationPublic';

export type ArmTestRow = { robotId:string;status:'pending'|'passed'|'failed'|'excluded';detail?:string };
function object(value:unknown):Record<string,unknown>|undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
export function armTestRows(node:AutomationNodeExecutionSummary|undefined):ArmTestRow[] {
  const rows = object(node?.output ?? node?.progress)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    const row = object(value);
    if (!row || typeof row.robotId !== 'string' || !['pending','passed','failed','excluded'].includes(String(row.status))) return [];
    return [{ robotId:row.robotId,status:row.status as ArmTestRow['status'],detail:typeof row.detail === 'string' ? row.detail : undefined }];
  });
}
export function preflightChildRunId(detail:AutomationRunDetail|undefined):string|undefined {
  if (detail?.nodeSummaries.some((node) => node.nodeId === 'arm-observe' && node.kind === 'robot.operation-observe')) return detail.run?.id;
  return detail?.relations?.childRuns.find((child) => child.callNodeId === 'call-preflight-arm-test')?.childRunId;
}
export function preflightRoster(detail:AutomationRunDetail|undefined,fallback:readonly string[]):readonly string[] {
  const ids = detail?.run?.parameters.robotIds;
  return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids as string[] : fallback;
}
export function preflightPhase(detail:AutomationRunDetail|undefined) {
  const nodes = detail?.nodeSummaries ?? [];
  const node = (id:string) => nodes.find((item) => item.nodeId === id);
  const active = (id:string) => ['running','waiting','compensating'].includes(node(id)?.status ?? '');
  if (nodes.some((item) => item.status === 'compensating') || active('disarm-observe')) return 'cleanup';
  if (active('reboot-failed')) return 'rebooting';
  if (active('arm-observe')) return 'testing';
  if (node('arm-observe')?.status === 'succeeded') return 'results';
  return 'confirmation';
}
