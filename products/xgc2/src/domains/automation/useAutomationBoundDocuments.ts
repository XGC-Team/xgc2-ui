import { useEffect,useMemo,useRef,useState } from 'react';
import { useDocumentVisibility } from '../../hooks/useDocumentVisibility';
import type { ConfigRef } from '../../shared/configResource';
import { isWorkflowRuntimeDefinitionEvent,WORKFLOW_RUNTIME_ENTITY_TYPE,workflowRuntimeEvents } from '../../shared/workflowRuntimeProtocol';
import { useExecutionEventChannel } from '../execution/executionPublic';
import type { AutomationDocument } from './automationDefinitionContracts';
import { getAutomationDocument,isAutomationDocumentNotFound } from './automationDocumentService';

type Binding={ resourceId:string;branch:string };
type Scope={ key:string;refsKey:string };
type Snapshot={ scope:Scope;documents:AutomationDocument[];unavailable:ReadonlySet<string> };

/** Resolve consumer schemas independently of editor selection and frozen Run identity. */
export function useAutomationBoundDocuments({ scopeKey,refs,documents,enabled=true }: {
  scopeKey:string;
  refs:readonly ConfigRef[];
  documents:readonly AutomationDocument[];
  enabled?:boolean;
}) {
  const documentVisible=useDocumentVisibility();
  const canRead=enabled && documentVisible;
  const refsKey=JSON.stringify([...new Set(refs.filter((ref) => (
    ref.domain==='automation' && ref.resourceId && ref.branch
  )).map((ref) => JSON.stringify([ref.resourceId,ref.branch])))].sort());
  const bindings=useMemo(() => (JSON.parse(refsKey) as string[]).map((key) => {
    const [resourceId,branch]=JSON.parse(key) as [string,string];
    return { resourceId,branch };
  }),[refsKey]);
  const scope=useMemo(() => ({ key:scopeKey,refsKey }),[refsKey,scopeKey]);
  const scopeRef=useRef(scope);
  scopeRef.current=scope;
  const documentsRef=useRef(documents);
  documentsRef.current=documents;
  const [snapshot,setSnapshot]=useState<Snapshot>(() => emptySnapshot(scope));
  const snapshotRef=useRef(snapshot);
  snapshotRef.current=snapshot;
  const observedKey=JSON.stringify(bindings.map((binding) => documents.filter((document) => (
    matches(document,binding)
  )).map((document) => [
    document.head.resourceId,document.branch.name,document.head.revision,
    document.branch.revision,document.branch.headCommitId,
  ])));
  const previousCatalog=useRef({ scope,observedKey });
  const activated=useRef<Scope|undefined>(undefined);
  const refreshRef=useRef<((resourceIds?:ReadonlySet<string>) => void)|undefined>(undefined);
  const replay=useMemo(() => ({ scope,seen:new Set<string>() }),[scope]).seen;
  const streamStateRef=useRef('connected');
  // Definition ownership is Core-global. This subscribes to the existing local
  // channel; it does not create one schema stream per Panel or Agent.
  const channel=useExecutionEventChannel('local',(event) => {
    if (event.entityType!==WORKFLOW_RUNTIME_ENTITY_TYPE || !isWorkflowRuntimeDefinitionEvent(event.type)) return;
    // Closure events identify the immutable closure digest, not a resource ID.
    const allBindings=event.type===workflowRuntimeEvents.executionClosureInstalled || !event.entityId.trim();
    const resourceIds=new Set(bindings.filter((binding) => (
      allBindings || binding.resourceId===event.entityId
    )).map((binding) => binding.resourceId));
    if (streamStateRef.current==='replaying' || !refreshRef.current) {
      resourceIds.forEach((id) => replay.add(id));
    } else refreshRef.current(resourceIds);
  });
  streamStateRef.current=channel.streamState;
  const previousChannel=useRef({ scope,id:channel.streamId,state:channel.streamState });

  useEffect(() => {
    if (!canRead || bindings.length===0) return;
    const controller=new AbortController();
    const valid=() => !controller.signal.aborted && scopeRef.current===scope;
    const current=() => snapshotRef.current.scope===scope ? snapshotRef.current : emptySnapshot(scope,snapshotRef.current.unavailable);
    const update=(next:Snapshot) => {
      if (!valid()) return;
      snapshotRef.current=next;
      setSnapshot(next);
    };
    const available=() => resolvedDocuments(current(),documentsRef.current);
    type Read={ binding:Binding;version:number;running:boolean;queued:boolean };
    const reads=new Map<string,Read>();
    // Bindings whose latest exact read failed in transport (or answered for
    // another resource). Only these are retried when the window regains focus.
    const failed=new Set<Read>();
    const queue:Read[]=[];
    let active=0;
    const enqueue=(read:Read) => {
      if (read.queued || read.running || !valid()) return;
      read.queued=true;
      queue.push(read);
    };
    const pump=() => {
      while (valid() && active<2 && queue.length) {
        const read=queue.shift()!;
        read.queued=false;
        read.running=true;
        active+=1;
        const version=read.version;
        const key=bindingKey(read.binding);
        void getAutomationDocument(read.binding.resourceId,{
          branch:read.binding.branch,signal:controller.signal,
        }).then((document) => {
          if (!valid() || read.version!==version) return;
          if (!matches(document,read.binding)) { failed.add(read);return; }
          failed.delete(read);
          const previous=current();
          const unavailable=new Set(previous.unavailable);
          unavailable.delete(key);
          update({ scope,unavailable,documents:mergeDocuments(previous.documents,[document]) });
        }).catch((cause:unknown) => {
          if (!valid() || read.version!==version) return;
          if (!isAutomationDocumentNotFound(cause)) { failed.add(read);return; }
          failed.delete(read);
          const previous=current();
          // Only this exact resource/branch read can revoke a schema. A stale
          // catalog cannot resurrect it; a subsequent exact success can.
          update({ scope,unavailable:new Set([...previous.unavailable,key]),
            documents:previous.documents.filter((document) => documentKey(document)!==key) });
        }).finally(() => {
          read.running=false;
          active-=1;
          if (!valid()) return;
          // Invalidations while reading need one trailing read, queued behind
          // existing waiters. Its response belongs to the newer boundary.
          if (read.version!==version) enqueue(read);
          pump();
        });
      }
    };
    const invalidateBinding=(binding:Binding) => {
      const key=bindingKey(binding);
      let read=reads.get(key);
      if (!read) {
        read={ binding,version:0,running:false,queued:false };
        reads.set(key,read);
      }
      read.version+=1;
      enqueue(read);
    };
    const refresh=(resourceIds?:ReadonlySet<string>) => {
      bindings.filter((binding) => !resourceIds || resourceIds.has(binding.resourceId)).forEach(invalidateBinding);
      pump();
    };
    refreshRef.current=refresh;
    const returning=activated.current!==undefined;
    activated.current=scope;
    const known=available();
    const pending=bindings.filter((binding) => (
      returning || replay.has(binding.resourceId) || !known.some((document) => matches(document,binding))
    ));
    replay.clear();
    pending.forEach(invalidateBinding);
    pump();
    // Retained schemas follow definition events, stream resets and the return
    // from a hidden tab (this effect re-runs). Window focus also fires on every
    // click back from an embedded viewer, so it only retries failed reads.
    const retryFailed=() => {
      if (document.visibilityState!=='visible' || failed.size===0) return;
      failed.forEach((read) => {
        // A read already in flight or waiting answers for this binding.
        if (read.running || read.queued) return;
        read.version+=1;
        enqueue(read);
      });
      pump();
    };
    window.addEventListener('focus',retryFailed);
    return () => {
      controller.abort();
      queue.length=0;
      if (refreshRef.current===refresh) refreshRef.current=undefined;
      window.removeEventListener('focus',retryFailed);
    };
  },[bindings,canRead,replay,scope]);

  useEffect(() => {
    const previous=snapshotRef.current.scope===scope ? snapshotRef.current : emptySnapshot(scope,snapshotRef.current.unavailable);
    const next={ ...previous,documents:mergeDocuments(previous.documents,documentsRef.current.filter((document) => (
      !previous.unavailable.has(documentKey(document)) && bindings.some((binding) => matches(document,binding))
    ))) };
    if (next.documents.length!==previous.documents.length
      || next.documents.some((document,index) => document!==previous.documents[index])
      || snapshotRef.current.scope!==scope) {
      snapshotRef.current=next;
      setSnapshot(next);
    }
    const prior=previousCatalog.current;
    previousCatalog.current={ scope,observedKey };
    if (prior.scope===scope && prior.observedKey!==observedKey) {
      // A new revision or a missing list row is an invalidation, never proof of
      // presence/absence. Revalidate bound schemas even when one was cached.
      const before=JSON.parse(prior.observedKey) as unknown[];
      const after=JSON.parse(observedKey) as unknown[];
      const changed=new Set(bindings.filter((_,index) => (
        JSON.stringify(before[index])!==JSON.stringify(after[index])
      )).map((binding) => binding.resourceId));
      if (refreshRef.current) refreshRef.current(changed);
      else changed.forEach((id) => replay.add(id));
    }
  },[bindings,observedKey,replay,scope]);

  useEffect(() => {
    const previous=previousChannel.current;
    previousChannel.current={ scope,id:channel.streamId,state:channel.streamState };
    if (previous.scope!==scope) return;
    if (previous.id!==channel.streamId) {
      if (refreshRef.current) refreshRef.current();
      else bindings.forEach((binding) => replay.add(binding.resourceId));
    } else if (previous.state==='replaying' && channel.streamState==='connected' && replay.size) {
      refreshRef.current?.(new Set(replay));
      if (refreshRef.current) replay.clear();
    }
  },[bindings,channel.streamId,channel.streamState,replay,scope]);

  return resolvedDocuments(snapshot.scope===scope ? snapshot : emptySnapshot(scope,snapshot.unavailable),documents);
}

// A confirmed absence belongs to the Core-global resource/branch, so changing
// Panels or target scopes cannot resurrect its stale catalog row.
function emptySnapshot(scope:Scope,unavailable:ReadonlySet<string>=new Set()):Snapshot { return { scope,documents:[],unavailable }; }
function matches(document:AutomationDocument,binding:Binding) {
  return document.head.domain==='automation' && document.head.resourceId===binding.resourceId
    && document.branch.domain==='automation'
    && document.branch.resourceId===binding.resourceId && document.branch.name===binding.branch;
}
function resolvedDocuments(snapshot:Snapshot,documents:readonly AutomationDocument[]) {
  return mergeDocuments(snapshot.documents,documents.filter((document) => !snapshot.unavailable.has(documentKey(document))));
}
function mergeDocuments(current:readonly AutomationDocument[],incoming:readonly AutomationDocument[]) {
  const merged=new Map(current.map((document) => [documentKey(document),document]));
  for (const document of incoming) {
    const key=documentKey(document);
    const previous=merged.get(key);
    if (!previous || (document.branch.revision>=previous.branch.revision
      && document.head.revision>=previous.head.revision
      && (document.branch.revision>previous.branch.revision
        || document.branch.headCommitId===previous.branch.headCommitId))) merged.set(key,document);
  }
  return [...merged.values()];
}
function bindingKey(binding:Binding) { return JSON.stringify([binding.resourceId,binding.branch]); }
function documentKey(document:AutomationDocument) { return bindingKey({ resourceId:document.head.resourceId,branch:document.branch.name }); }
