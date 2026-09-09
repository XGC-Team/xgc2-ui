/* global URL */

const activeRunStatuses=new Set(['accepted','queued','running','waiting','stopping']);

export function classifyFrontendRuntimeRead(request) {
  if (request.method()!=='GET') return undefined;
  const accept=String(request.headers().accept||'').toLowerCase();
  if (accept.includes('text/event-stream')) return undefined;
  const path=new URL(request.url()).pathname;
  const match=path.match(/^\/api\/execution-targets\/([^/]+)(\/.*)$/);
  if (!match) return undefined;
  let targetId=match[1];
  try { targetId=decodeURIComponent(targetId); } catch { return undefined; }
  const suffix=match[2];
  if (suffix==='/automation-execution-history'
    || suffix.startsWith('/automation-execution-history/')) return { kind:'history',targetId };
  if (suffix==='/experiment-sessions'
    || suffix.startsWith('/experiment-sessions/')) return { kind:'session',targetId };
  if (/^\/orchestration-runs\/[^/]+\/relations$/.test(suffix)) return { kind:'relations',targetId };
  if (/^\/orchestration-runs\/[^/]+\/robots(?:\/.*)?$/.test(suffix)) return { kind:'robot-runtime',targetId };
  if (suffix==='/orchestration-runs' || suffix.startsWith('/orchestration-runs/')) {
    return { kind:'orchestration-runtime',targetId };
  }
  if (suffix==='/process-instances' || suffix.startsWith('/process-instances/')) {
    return { kind:'process-runtime',targetId };
  }
  if (suffix==='/jobs' || suffix.startsWith('/jobs/')) return { kind:'job-runtime',targetId };
  return undefined;
}

export function activeRootObservationAtRequest(activeRoot,requestAt,connections) {
  const observation=runObservationAtRequest(activeRoot.id,requestAt,connections,activeRoot);
  return {
    ...observation,
    active:activeRunStatuses.has(observation.status),
  };
}

export function runObservationAtRequest(runId,requestAt,connections,initial) {
  let revision=initial?.revision;
  let status=initial?.status;
  const frames=(connections??[]).flatMap((connection) => connection.frames??[])
    .filter((frame) => (
      frame.entityType==='orchestration'
      && frame.entityId===runId
      && Number.isFinite(frame.receivedAt)
      && frame.receivedAt<=requestAt
      && Number.isSafeInteger(frame.runRevision)
      && frame.runRevision>0
      && typeof frame.runStatus==='string'
    ))
    .sort((left,right) => left.receivedAt-right.receivedAt || left.offset-right.offset);
  for (const frame of frames) {
    if (Number.isSafeInteger(revision) && frame.runRevision<revision) continue;
    revision=frame.runRevision;
    status=frame.runStatus;
  }
  return { id:runId,revision,status,observed:Number.isSafeInteger(revision) && revision>0 };
}

export function duplicateRelationRevisionKeys(observations) {
  const counts=new Map();
  observations.forEach(({ id,revision }) => {
    const key=`${id}:${revision}`;
    counts.set(key,(counts.get(key)??0)+1);
  });
  return [...counts.entries()].filter(([,count]) => count>1).map(([key]) => key).sort();
}

export function duplicateRuntimeReadRevisionKeys(observations) {
  const counts=new Map();
  observations.forEach(({ targetId,runId,endpoint,revision }) => {
    if (!targetId || !runId || !endpoint || !Number.isSafeInteger(revision) || revision<1) return;
    const key=`${targetId}:${runId}:${endpoint}:${revision}`;
    counts.set(key,(counts.get(key)??0)+1);
  });
  return [...counts.entries()].filter(([,count]) => count>1)
    .map(([key,count]) => ({ key,count })).sort((left,right) => left.key.localeCompare(right.key));
}

export function observedRuntimeIdentitySnapshot(reads,{
  beforeAt=Number.POSITIVE_INFINITY,pageEpoch,targetId,
}={}) {
  const ledger=runtimeReadLedger((reads??[]).filter((read) => (
    Number.isFinite(read.at) && read.at<beforeAt
    && (pageEpoch===undefined || read.pageEpoch===pageEpoch)
    && (!targetId || read.targetId===targetId)
  )));
  return {
    historyResourceIds:unique(ledger.historyReads.map((read) => read.automationResourceId)),
    runRefs:uniqueBy(ledger.runReads.map(({ targetId:readTargetId,runId }) => ({
      targetId:readTargetId,runId,
    })),({ targetId:readTargetId,runId }) => `${readTargetId}\0${runId}`),
    sessionTargetIds:unique(ledger.sessionReads.map((read) => read.targetId)),
    invalidReads:ledger.invalidReads,
  };
}

export function runtimeReadLedger(reads) {
  const historyReads=[];
  const sessionReads=[];
  const runReads=[];
  const invalidReads=[];
  for (const read of reads??[]) {
    const parsed=parseRuntimeReadIdentity(read);
    if (!parsed.ok) {
      invalidReads.push({ ...read,reason:parsed.reason });
      continue;
    }
    if (parsed.identity.kind==='history') historyReads.push({ ...read,...parsed.identity });
    else if (parsed.identity.kind==='session') sessionReads.push({ ...read,...parsed.identity });
    else runReads.push({ ...read,...parsed.identity });
  }
  return {
    historyReads,sessionReads,runReads,invalidReads,
    duplicateHistoryKeys:duplicateKeys(historyReads,(read) => (
      `${read.targetId}:history:${read.automationResourceId}`
    )),
    duplicateSessionKeys:duplicateKeys(sessionReads,(read) => `${read.targetId}:sessions`),
    duplicateRunEndpointKeys:duplicateKeys(runReads,(read) => (
      `${read.targetId}:${read.runId}:${read.endpoint}`
    )),
  };
}

export function relationIntroducedRunReads({ reads,rootRef,links }) {
  const firstReadByRun=new Map();
  const relationReadAtByRun=new Map();
  (reads??[]).forEach((read) => {
    const key=`${read.targetId}\0${read.runId}`;
    const first=firstReadByRun.get(key);
    if (!first || read.at<first.at) firstReadByRun.set(key,read);
    if (read.endpoint==='relations') {
      const at=relationReadAtByRun.get(key);
      if (!Number.isFinite(at) || read.at<at) relationReadAtByRun.set(key,read.at);
    }
  });
  const rootKey=`${rootRef.targetId}\0${rootRef.runId}`;
  const linksByChild=new Map();
  (links??[]).forEach((link) => {
    const key=`${link.childTargetId}\0${link.childRunId}`;
    linksByChild.set(key,[...(linksByChild.get(key)??[]),link]);
  });
  const introduced=[];
  const invalid=[];
  for (const [childKey,firstRead] of firstReadByRun) {
    if (childKey===rootKey) continue;
    const parents=linksByChild.get(childKey)??[];
    if (parents.length!==1) {
      invalid.push({ childKey,reason:`expected one exact parent relation, found ${parents.length}` });
      continue;
    }
    const parent=parents[0];
    const parentKey=`${parent.parentTargetId}\0${parent.parentRunId}`;
    const parentRelationAt=relationReadAtByRun.get(parentKey);
    if (!Number.isFinite(parentRelationAt) || parentRelationAt>=firstRead.at) {
      invalid.push({
        childKey,parentKey,parentRelationAt,childFirstReadAt:firstRead.at,
        reason:'parent relations were not read before the child detail',
      });
      continue;
    }
    introduced.push({ childKey,parentKey,parentRelationAt,childFirstReadAt:firstRead.at });
  }
  return { rootKey,introduced,invalid };
}

export function lifecycleRuntimeReadViolations(reads,{ targetId,systemRootId }) {
  const ledger=runtimeReadLedger(reads);
  const forbiddenRunReads=ledger.runReads.filter((read) => (
    read.targetId!==targetId || read.runId!==systemRootId || read.endpoint!=='relations'
  ));
  const foreignReads=[...ledger.historyReads,...ledger.sessionReads].filter((read) => (
    read.targetId!==targetId
  ));
  return {
    invalidReads:ledger.invalidReads,
    forbiddenRunReads,
    foreignReads,
  };
}

export function parseRuntimeReadIdentity(read) {
  let parsed;
  try { parsed=new URL(read?.url); } catch { return { ok:false,reason:'invalid URL' }; }
  if (parsed.hash) return { ok:false,reason:'runtime read URL contains a fragment' };
  const match=parsed.pathname.match(/^\/api\/execution-targets\/([^/]+)(\/.*)$/);
  if (!match) return { ok:false,reason:'runtime read is outside the execution target API' };
  let targetId;
  try { targetId=decodeURIComponent(match[1]); } catch { return { ok:false,reason:'invalid target identity' }; }
  if (!targetId || targetId!==read.targetId) return { ok:false,reason:'runtime read target identity drifted' };
  const suffix=match[2];
  if (read.kind==='history') {
    if (suffix!=='/automation-execution-history') {
      return { ok:false,reason:'history read is not the exact bounded collection path' };
    }
    const keys=[...parsed.searchParams.keys()].sort();
    const resourceId=parsed.searchParams.get('automationResourceId')?.trim()??'';
    if (keys.join(',')!=='automationResourceId,limit' || !resourceId
      || parsed.searchParams.get('limit')!=='25') {
      return { ok:false,reason:'history read is not one exact 25-entry Automation page' };
    }
    return { ok:true,identity:{ kind:'history',targetId,automationResourceId:resourceId } };
  }
  if (read.kind==='session') {
    if (suffix!=='/experiment-sessions' || parsed.search) {
      return { ok:false,reason:'session reconciliation is not one exact station snapshot' };
    }
    return { ok:true,identity:{ kind:'session',targetId } };
  }
  const runMatch=suffix.match(/^\/orchestration-runs\/([^/]+)(?:\/(invocations|node-summaries|relations|snapshot))?$/);
  if (!runMatch || parsed.search) {
    return { ok:false,reason:'orchestration read is not one exact Run detail endpoint' };
  }
  let runId;
  try { runId=decodeURIComponent(runMatch[1]); } catch { return { ok:false,reason:'invalid Run identity' }; }
  if (!runId) return { ok:false,reason:'Run identity is empty' };
  const endpoint=runMatch[2]||'run';
  const expectedKind=endpoint==='relations' ? 'relations' : 'orchestration-runtime';
  if (read.kind!==expectedKind) return { ok:false,reason:'runtime read kind disagrees with its endpoint' };
  return { ok:true,identity:{ kind:'run',targetId,runId,endpoint } };
}

function duplicateKeys(items,keyOf) {
  const counts=new Map();
  items.forEach((item) => {
    const key=keyOf(item);
    counts.set(key,(counts.get(key)??0)+1);
  });
  return [...counts.entries()].filter(([,count]) => count>1)
    .map(([key,count]) => ({ key,count })).sort((left,right) => left.key.localeCompare(right.key));
}

function unique(items) {
  return [...new Set(items)].sort();
}

function uniqueBy(items,keyOf) {
  const result=new Map();
  items.forEach((item) => result.set(keyOf(item),item));
  return [...result.entries()].sort(([left],[right]) => left.localeCompare(right)).map(([,item]) => item);
}
