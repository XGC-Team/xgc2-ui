import { useEffect,useState,type ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { Notice,StatusText } from '@xgc2/ui-react';
import type {
  AutomationChildRunGroupMemberRelation,
  AutomationChildRunGroupRelation,
  AutomationExecutionRelations,
  AutomationRuntimeGroupRelation,
} from './automationExecutionContracts';

export function AutomationExecutionRelationsView({
  relations,
  invocationId = '',
  onOpenRun,
  onOpenInvocation,
}: {
  relations: AutomationExecutionRelations;
  invocationId?: string;
  onOpenRun?: (runId: string) => void | Promise<unknown>;
  onOpenInvocation?: (invocationId: string) => void;
}) {
  const [focusedGroupId, setFocusedGroupId] = useState('');
  useEffect(() => setFocusedGroupId(''), [invocationId,relations.runId]);
  const children = relations.childRuns.filter((item) => !invocationId || item.parentInvocationId === invocationId);
  const childGroups = relations.childRunGroups.filter((item) => !invocationId || item.producerInvocationId === invocationId);
  const visibleChildGroupIDs = new Set(childGroups.map((item) => item.id));
  const childGroupMembers = relations.childRunGroupMembers.filter((item) => visibleChildGroupIDs.has(item.groupId));
  const groupedChildRunIDs = new Set(childGroupMembers.map((item) => item.childRunId));
  const ungroupedChildren = children.filter((item) => !groupedChildRunIDs.has(item.childRunId));
  const childByRun = new Map(children.map((item) => [item.childRunId,item]));
  const waits = relations.waits.filter((item) => !invocationId || item.invocationId === invocationId);
  const effects = relations.effects.filter((item) => !invocationId || item.invocationId === invocationId);
  const groups = relations.runtimeGroups.filter((item) => !invocationId || item.invocationId === invocationId);
  const runtimes = relations.runtimes.filter((item) => !invocationId || item.invocationId === invocationId);
  const resources = relations.resources.filter((item) => !invocationId || item.invocationId === invocationId);
  const count = ungroupedChildren.length + childGroups.length + childGroupMembers.length + waits.length + effects.length + groups.length + runtimes.length + resources.length;
  const scopeId = invocationId || relations.runId;
  return (
    <section
      className="automation-occurrences-section"
      data-xgc-role={invocationId ? 'automation-occurrence-relations' : 'automation-run-relations'}
      data-xgc-id={scopeId}
    >
      <header>
        <strong>{invocationId ? 'Invocation relationships' : 'Execution relationships'}</strong>
        <span>{count}</span>
      </header>
      {count === 0 && (
        <span className="automation-runtime-value-empty" data-xgc-role="automation-relations-empty" data-xgc-id={scopeId}>
          No child Run or group, durable wait, effect, Runtime, or resource is recorded for this {invocationId ? 'invocation' : 'Run'}.
        </span>
      )}
      {childGroups.length > 0 && <RelationSection title="Child Run groups" count={childGroups.length}>
        {childGroups.map((group) => <ChildRunGroupCard
          group={group}
          members={childGroupMembers.filter((item) => item.groupId === group.id)}
          currentInvocation={invocationId}
          childBound={(childRunId) => Boolean(childByRun.get(childRunId)?.boundAt)}
          onOpenInvocation={onOpenInvocation}
          onOpenRun={onOpenRun}
          key={group.id}
        />)}
      </RelationSection>}
      {ungroupedChildren.length > 0 && <RelationSection title="Child Runs" count={ungroupedChildren.length}>
        {ungroupedChildren.map((child) => <RelationCard role="automation-child-run-relation" id={child.id} state={child.relation} key={child.id}>
          <RelationTitle title={`Child ${shortID(child.childRunId)}`} subtitle={`${child.waitPolicy} · ${child.cancelPolicy} · ${child.resultPolicy}`} state={child.relation} stateLabel="Relation" stateRole="automation-child-run-relation-mode" stateId={child.id} />
          <RelationInvocation invocationId={child.parentInvocationId} current={invocationId} onOpen={onOpenInvocation} />
          <ControlButton  type="button" data-xgc-role="automation-child-run-open" data-xgc-id={child.childRunId} disabled={!onOpenRun} onClick={() => void onOpenRun?.(child.childRunId)}>Open child Run</ControlButton>
        </RelationCard>)}
      </RelationSection>}
      {waits.length > 0 && <RelationSection title="Durable waits" count={waits.length}>
        {waits.map((wait) => <RelationCard role="automation-wait-relation" id={wait.id} state={wait.state} key={wait.id}>
          <RelationTitle title={`${wait.type} wait`} subtitle={`generation ${wait.generation}`} state={wait.state} stateLabel="Wait" stateRole="automation-wait-state" stateId={wait.id} />
          <RelationInvocation invocationId={wait.invocationId} current={invocationId} onOpen={onOpenInvocation} />
          <RelationFacts facts={[
            ['Reason',wait.reason || '—'],['Subject',wait.subjectId || '—'],
            ['Wake',formatTimestamp(wait.wakeAt)],['Deadline',formatTimestamp(wait.deadline)],
          ]} />
        </RelationCard>)}
      </RelationSection>}
      {effects.length > 0 && <RelationSection title="Effects" count={effects.length}>
        {effects.map((effect) => <RelationCard role="automation-effect-relation" id={effect.id} state={effect.state} key={effect.id}>
          <RelationTitle title={effect.kind} subtitle={`${effect.effectKey} · ${effect.ownership}`} state={effect.state} stateLabel="Effect" stateRole="automation-effect-state" stateId={effect.id} />
          <RelationInvocation invocationId={effect.invocationId} current={invocationId} onOpen={onOpenInvocation} />
          <RelationFacts facts={[
            ['Primary state',effect.state],['External identity',effect.externalIdentity || '—'],
            ['Compensation',`${effect.compensationState} · ${effect.compensationAttemptCount} attempts`],
          ]} />
          {effect.primaryError && <RelationError label="Primary error" kind={effect.primaryErrorClass} message={effect.primaryError} role="automation-effect-primary-error" id={effect.id} />}
          {effect.compensationError && <RelationError label="Cleanup error" kind={effect.compensationErrorClass} message={effect.compensationError} role="automation-effect-compensation-error" id={effect.id} />}
        </RelationCard>)}
      </RelationSection>}
      {(groups.length > 0 || runtimes.length > 0) && <RelationSection title="Long-lived Runtimes" count={groups.length + runtimes.length}>
        <small data-xgc-role="automation-runtime-independence" data-xgc-id={scopeId}>Runtime lifecycle remains independent after its Run or start invocation finishes.</small>
        {groups.map((group) => <RuntimeGroupCard
          group={group}
          currentInvocation={invocationId}
          focused={focusedGroupId === group.id}
          onOpenInvocation={onOpenInvocation}
          key={group.id}
        />)}
        {runtimes.map((runtime) => <RelationCard role="automation-runtime-instance" id={runtime.id} state={runtime.state} key={runtime.id}>
          <RelationTitle title={runtime.bindingKey} subtitle={`${runtime.relation} · ${runtime.ownership} · ${runtime.cleanupPolicy}`} state={runtime.state} stateLabel="Runtime" stateRole="automation-runtime-state" stateId={runtime.id} />
          <RelationInvocation invocationId={runtime.invocationId} current={invocationId} onOpen={onOpenInvocation} />
          <ControlButton  type="button" data-xgc-role="automation-runtime-group-open" data-xgc-id={runtime.groupId} onClick={() => setFocusedGroupId(runtime.groupId)}>Group {shortID(runtime.groupId)}</ControlButton>
          <RelationFacts facts={[[
            'Backend',`${runtime.backendKind} · ${runtime.backendId}`,
          ],['Owner',`${runtime.ownerType} · ${runtime.ownerId}`],['Runtime state',runtime.state]]} />
          <code data-xgc-role="automation-runtime-backend" data-xgc-id={runtime.backendId}>{runtime.backendId}</code>
        </RelationCard>)}
      </RelationSection>}
      {resources.length > 0 && <RelationSection title="Resources" count={resources.length}>
        {resources.map((resource) => <RelationCard role="automation-resource-relation" id={resource.id} state={resource.state} key={resource.id}>
          <RelationTitle title={resource.resourceKey} subtitle={`${resource.mode} · slot ${resource.slot + 1}/${resource.capacity}`} state={resource.state} stateLabel="Resource" stateRole="automation-resource-state" stateId={resource.id} />
          <RelationInvocation invocationId={resource.invocationId} current={invocationId} onOpen={onOpenInvocation} />
          {resource.runtimeGroupId && <ControlButton  type="button" data-xgc-role="automation-resource-runtime-group-open" data-xgc-id={resource.runtimeGroupId} onClick={() => setFocusedGroupId(resource.runtimeGroupId ?? '')}>Runtime group {shortID(resource.runtimeGroupId)}</ControlButton>}
          <RelationFacts facts={[[
            'Scope',`${resource.scope} · ${resource.scopeId}`,
          ],['Owner',`${resource.ownerType} · ${resource.ownerId}`],['Cleanup',resource.cleanupPolicy],
          ['Resource state',resource.state],['Lost at',formatTimestamp(resource.lostAt)]]} />
          {resource.lossReason && <RelationError label="Resource loss" message={resource.lossReason} role="automation-resource-loss-reason" id={resource.id} />}
          {resource.cleanupError && <RelationError label="Cleanup error" message={resource.cleanupError} role="automation-resource-cleanup-error" id={resource.id} />}
        </RelationCard>)}
      </RelationSection>}
    </section>
  );
}

function ChildRunGroupCard({ group,members,currentInvocation,childBound,onOpenInvocation,onOpenRun }: {
  group: AutomationChildRunGroupRelation;
  members: AutomationChildRunGroupMemberRelation[];
  currentInvocation: string;
  childBound: (runId: string) => boolean;
  onOpenInvocation?: (invocationId: string) => void;
  onOpenRun?: (runId: string) => void | Promise<unknown>;
}) {
  return <RelationCard role="automation-child-run-group-relation" id={group.id} state={group.state}>
    <RelationTitle title={group.groupKey} subtitle={`${group.joinMode} · ${group.failurePolicy} · ${group.remainingPolicy}`} state={group.state} stateLabel="Child group" stateRole="automation-child-run-group-state" stateId={group.id} />
    <RelationInvocation invocationId={group.producerInvocationId} current={currentInvocation} onOpen={onOpenInvocation} />
    <RelationFacts facts={[
      ['Members',`${members.length} prepared · ${group.memberCount}/${group.expectedMembers} sealed`],
      ['Concurrency',String(group.maxConcurrency)],['Wait',group.waitPolicy],
      ['Outcome',group.outcome || '—'],['Winner',group.winnerChildRunId ? shortID(group.winnerChildRunId) : '—'],
    ]} />
    {members.length > 0 && <RelationSection title="Group members" count={members.length}>
      {members.map((member) => <RelationCard role="automation-child-run-group-member" id={member.id} state={member.state} key={member.id}>
        <RelationTitle title={member.itemKey} subtitle={`item ${member.ordinal + 1}`} state={member.state} stateLabel="Member" stateRole="automation-child-run-group-member-state" stateId={member.id} />
        <ControlButton

          type="button"
          data-xgc-role="automation-child-run-group-member-open"
          data-xgc-id={member.childRunId}
          disabled={!onOpenRun || !childBound(member.childRunId)}
          onClick={() => void onOpenRun?.(member.childRunId)}
        >Open child Run {shortID(member.childRunId)}</ControlButton>
      </RelationCard>)}
    </RelationSection>}
  </RelationCard>;
}

function RuntimeGroupCard({ group,currentInvocation,focused,onOpenInvocation }: {
  group: AutomationRuntimeGroupRelation;
  currentInvocation: string;
  focused: boolean;
  onOpenInvocation?: (invocationId: string) => void;
}) {
  return <RelationCard role="automation-runtime-group" id={group.id} state={group.state} current={focused}>
    <RelationTitle title={group.groupKey} subtitle="Runtime group" state={group.state} stateLabel="Runtime group" stateRole="automation-runtime-group-state" stateId={group.id} />
    <RelationInvocation invocationId={group.invocationId} current={currentInvocation} onOpen={onOpenInvocation} />
    <RelationFacts facts={[[
      'Manifest',shortID(group.manifestDigest),
    ],['Updated',formatTimestamp(group.updatedAt)]]} />
    {group.lifecycleError && <RelationError label="Runtime lifecycle error" message={group.lifecycleError} role="automation-runtime-group-error" id={group.id} />}
  </RelationCard>;
}

function RelationSection({ title,count,children }: { title: string;count: number;children: ReactNode }) {
  return <section className="automation-occurrences-attempts"><header><strong>{title}</strong><span>{count}</span></header>{children}</section>;
}
function RelationCard({ role,id,state,current = false,children }: { role: string;id: string;state: string;current?: boolean;children: ReactNode }) {
  return <article className="automation-occurrences-card" data-xgc-status={state} data-xgc-role={role} data-xgc-id={id} aria-current={current ? 'true' : undefined}>{children}</article>;
}
function RelationTitle({ title,subtitle,state,stateLabel,stateRole,stateId }: {
  title: string;subtitle: string;state: string;stateLabel: string;stateRole: string;stateId: string;
}) {
  return <header><div><strong>{title}</strong><small>{subtitle}</small></div><StatusText status={state} data-xgc-role={stateRole} data-xgc-id={stateId}>{stateLabel}: {state}</StatusText></header>;
}
function RelationInvocation({ invocationId,current,onOpen }: { invocationId: string;current: string;onOpen?: (id: string) => void }) {
  if (current === invocationId) return null;
  if (!onOpen) return <code title={invocationId}>Invocation {shortID(invocationId)}</code>;
  return <ControlButton  type="button" data-xgc-role="automation-relation-invocation-open" data-xgc-id={invocationId} onClick={() => onOpen?.(invocationId)}>Invocation {shortID(invocationId)}</ControlButton>;
}
function RelationFacts({ facts }: { facts: Array<[string,string]> }) {
  return <dl className="automation-occurrences-facts">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function RelationError({ label,kind,message,role,id }: { label: string;kind?: string;message: string;role: string;id: string }) {
  return <Notice density="compact" heading={`${label}${kind ? ` · ${kind}` : ''}`} tone="danger" data-xgc-role={role} data-xgc-id={id}>{message}</Notice>;
}
function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function shortID(value: string) { return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-4)}` : value; }
