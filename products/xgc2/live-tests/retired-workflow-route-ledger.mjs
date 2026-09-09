/* global URL */

const RETIRED_WORKFLOW_RUN_SEGMENTS=new Set([
  'workflow-runs',
  'experiment-workflow-runs',
]);

export function isRetiredWorkflowRunPath(pathname) {
  if (typeof pathname!=='string' || !pathname.startsWith('/')) return false;
  return pathname.split('/').some((segment) => RETIRED_WORKFLOW_RUN_SEGMENTS.has(segment));
}

export function recordRetiredWorkflowRouteRequest(ledger,request,cell) {
  if (!Array.isArray(ledger)) throw new Error('retired Workflow route request ledger must be an array');
  const url=request.url();
  const path=new URL(url).pathname;
  if (!isRetiredWorkflowRunPath(path)) return undefined;
  const entry={
    cell:String(cell||'preflight'),
    method:String(request.method()||'GET').toUpperCase(),
    path,
    url,
  };
  ledger.push(entry);
  return entry;
}

export function assertNoRetiredWorkflowRouteRequests(
  ledger,{ startIndex=0,scope='browser' }={},
) {
  if (!Array.isArray(ledger)) throw new Error('retired Workflow route request ledger must be an array');
  if (!Number.isSafeInteger(startIndex) || startIndex<0 || startIndex>ledger.length) {
    throw new Error('retired Workflow route request ledger start index is invalid');
  }
  const requests=ledger.slice(startIndex);
  if (requests.length>0) {
    throw new Error(`${scope} used retired Workflow Run endpoints: ${JSON.stringify(requests)}`);
  }
  return requests;
}
