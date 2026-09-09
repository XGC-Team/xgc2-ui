import type {
  AutomationChildRunRelation,
  AutomationChildRunGroupMemberRelation,
  AutomationChildRunGroupRelation,
  AutomationEffectRelation,
  AutomationExecutionRelations,
  AutomationNodeInvocation,
  AutomationResourceRelation,
  AutomationRuntimeGroupRelation,
  AutomationRuntimeRelation,
  AutomationWaitRelation,
} from './automationExecutionContracts';

type Rule = 'string' | 'positive' | 'non-negative' | 'boolean';
type RowSchema = {
  required: Record<string,Rule>;
  optional?: Record<string,Rule>;
  enums?: Record<string,readonly string[]>;
};

const ownership = ['owned','borrowed','shared'] as const;
const relation = ['attached','supervised','detached'] as const;
const failureClass = ['transient','permanent','canceled','uncertain'] as const;

const childSchema: RowSchema = {
  required: strings(
    'id','targetId','rootRunId','parentRunId','parentInvocationId','callNodeId','childRunId','ownerRunId',
    'childDefinitionId','childConfigDigest','childExecutionPlanDigest','childRegistryDigest','childDefinitionDigest',
    'triggerNodeId','relation','waitPolicy','cancelPolicy','resultPolicy','createdAt','updatedAt',
  ),
  optional: {
    ...strings(
      'boundAt','launchAbandonedAt','launchAbandonedReason','runStatus','targetRootBindingId',
      'targetRootPresetId','targetRootActionId','targetRootRunMode','observedStatus','observedAt',
      'observedFinishedAt','observedReason',
    ),
    targetRoot:'boolean',
  },
  enums: {
    relation,waitPolicy: ['wait','no-wait','join-later'],cancelPolicy: ['cascade','retain','explicit'],resultPolicy: ['propagate','reference','discard'],
    runStatus:['accepted','queued','running','waiting','stopping','succeeded','failed','canceled','stopped','rejected'],
    observedStatus:['accepted','queued','running','waiting','stopping','succeeded','failed','canceled','stopped','rejected'],
  },
};
addNumbers(childSchema, { ordinal: 'non-negative',childDefinitionVersion: 'positive',revision: 'positive' });
addOptionalNumbers(childSchema,{ runRevision:'positive',targetRootActionVersion:'positive',observedRevision:'positive' });

const childGroupSchema: RowSchema = {
  required: strings('id','targetId','rootRunId','parentRunId','producerInvocationId','producerNodeId','groupKey','waitPolicy','joinMode','failurePolicy','remainingPolicy','resultPolicy','state','createdAt','updatedAt'),
  optional: strings('membershipDigest','outcome','winnerChildRunId','sealedAt','resolvedAt'),
  enums: {
    waitPolicy: ['wait','join-later'],joinMode: ['join-all','join-any'],failurePolicy: ['fail-fast','collect-errors'],
    remainingPolicy: ['cancel','retain'],resultPolicy: ['propagate','reference','discard'],
    state: ['open','sealed','resolved','canceled'],outcome: ['succeeded','failed','canceled','rejected','completed-with-errors'],
  },
};
addNumbers(childGroupSchema, { expectedMembers: 'non-negative',memberCount: 'non-negative',maxConcurrency: 'positive',terminalCount: 'non-negative',revision: 'positive' });

const childGroupMemberSchema: RowSchema = {
  required: strings('id','groupId','itemKey','childRunId','state','createdAt','updatedAt'),
  optional: strings('dispatchedAt','terminalAt'),
  enums: { state: ['queued','leased','dispatched','terminal','abandoned','cancel-requested'] },
};
addNumbers(childGroupMemberSchema, { ordinal: 'non-negative',revision: 'positive' });

const waitSchema: RowSchema = {
  required: strings('id','type','runId','invocationId','attemptId','state','createdAt','updatedAt'),
  optional: strings('subjectId','wakeAt','deadline','reason','terminalAt','deliveredAt'),
  enums: { type: ['timer','event','human','child','child-group','runtime','resource','job','ros-core-ready','gazebo-ready','robot-operation','callback'],state: ['pending','resumed','timed-out','canceled'] },
};
addNumbers(waitSchema, { generation: 'positive',revision: 'positive' });

const effectSchema: RowSchema = {
  required: strings('id','targetId','runId','invocationId','preparedAttemptId','effectKey','kind','ownership','checkpointDigest','state','compensationPolicy','compensationState','preparedAt','updatedAt'),
  optional: strings('externalIdentity','primaryErrorClass','primaryError','compensationErrorClass','compensationError','applyingAt','primaryTerminalAt','compensationStartedAt','compensationFinishedAt'),
  enums: {
    ownership,
    state: ['prepared','applying','applied','failed','uncertain'],
    primaryErrorClass: failureClass,
    compensationPolicy: ['none','required','best-effort'],
    compensationState: ['not-required','unscheduled','pending','running','succeeded','failed'],
    compensationErrorClass: failureClass,
  },
};
addNumbers(effectSchema, { compensationAttemptCount: 'non-negative',revision: 'positive' });

const runtimeGroupSchema: RowSchema = {
  required: strings('id','targetId','runId','invocationId','preparedAttemptId','groupKey','manifestDigest','state','createdAt','updatedAt'),
  optional: strings('lifecycleError','terminalAt'),
  enums: { state: ['preparing','active','releasing','released','failed'] },
};
addNumbers(runtimeGroupSchema, { revision: 'positive' });

const runtimeSchema: RowSchema = {
  required: strings('id','targetId','groupId','runId','invocationId','bindingKey','backendKind','backendId','ownership','relation','cleanupPolicy','ownerType','ownerId','state','createdAt','updatedAt'),
  optional: strings('transferredAt','releaseStartedAt','releasedAt'),
  enums: {
    backendKind: ['process-instance','managed-backend'],ownership,relation,
    cleanupPolicy: ['stop','release','retain','explicit'],state: ['active','stopping','released'],
  },
};
addNumbers(runtimeSchema, { revision: 'positive' });

const resourceSchema: RowSchema = {
  required: strings('id','targetId','runId','invocationId','boundAttemptId','bindingKey','resourceKey','mode','ownership','cleanupPolicy','scope','scopeId','ownerType','ownerId','state','createdAt','updatedAt'),
  optional: strings('runtimeGroupId','releasedAt','lostAt','lossReason','cleanupError'),
  enums: {
    mode: ['exclusive','shared'],ownership,cleanupPolicy: ['release','retain','explicit'],
    scope: ['run','invocation','runtime-group'],state: ['active','released','lost'],
  },
};
addNumbers(resourceSchema, { capacity: 'positive',slot: 'non-negative',revision: 'positive' });

export function parseAutomationExecutionRelations(
  value: unknown,
  path: string,
  expectedRunId: string,
  expectedTargetId: string,
): AutomationExecutionRelations {
  const envelope = object(value, path);
  exactKeys(envelope, ['runId','childRuns','childRunGroups','childRunGroupMembers','waits','effects','runtimeGroups','runtimes','resources'], path);
  const runId = requiredString(envelope.runId, `${path}.runId`);
  if (runId !== expectedRunId) throw invalid(path, `belongs to unexpected Run "${runId}"`);
  const result: AutomationExecutionRelations = {
    runId,
    childRuns: rows<AutomationChildRunRelation>(envelope.childRuns, childSchema, `${path}.childRuns`),
    childRunGroups: rows<AutomationChildRunGroupRelation>(envelope.childRunGroups, childGroupSchema, `${path}.childRunGroups`),
    childRunGroupMembers: rows<AutomationChildRunGroupMemberRelation>(envelope.childRunGroupMembers, childGroupMemberSchema, `${path}.childRunGroupMembers`),
    waits: rows<AutomationWaitRelation>(envelope.waits, waitSchema, `${path}.waits`),
    effects: rows<AutomationEffectRelation>(envelope.effects, effectSchema, `${path}.effects`),
    runtimeGroups: rows<AutomationRuntimeGroupRelation>(envelope.runtimeGroups, runtimeGroupSchema, `${path}.runtimeGroups`),
    runtimes: rows<AutomationRuntimeRelation>(envelope.runtimes, runtimeSchema, `${path}.runtimes`),
    resources: rows<AutomationResourceRelation>(envelope.resources, resourceSchema, `${path}.resources`),
  };
  for (const child of result.childRuns) {
    if (child.parentRunId !== runId) throw invalid(path, 'contains a child outside the selected Run');
    if (Boolean(child.runStatus)!==Boolean(child.runRevision)
      || (child.runStatus && !child.boundAt)) throw invalid(path,'contains an incomplete local child Run projection');
    if (child.targetRoot) {
      if (child.runStatus || child.runRevision
        || Boolean(child.observedStatus)!==Boolean(child.observedRevision)) {
        throw invalid(path,'contains inconsistent target-root observation');
      }
    } else if (child.observedStatus || child.observedRevision || child.targetRootBindingId
      || child.targetRootPresetId || child.targetRootActionId || child.targetRootActionVersion
      || child.targetRootRunMode) {
      throw invalid(path,'contains target-root fields on an ordinary child');
    }
  }
  for (const group of result.childRunGroups) {
    if (group.parentRunId !== runId || group.targetId !== expectedTargetId) throw invalid(path, 'contains a child Run group outside the selected Run or target');
  }
  for (const item of [...result.effects,...result.runtimeGroups,...result.runtimes,...result.resources]) {
    if (item.runId !== runId || item.targetId !== expectedTargetId) throw invalid(path, 'contains a relation outside the selected Run or target');
  }
  for (const wait of result.waits) if (wait.runId !== runId) throw invalid(path, 'contains a wait outside the selected Run');
  validateRelationGraph(result, path);
  return result;
}

export function validateAutomationRelationLedger(
  relations: AutomationExecutionRelations,
  invocations: AutomationNodeInvocation[],
  path: string,
) {
  const invocationIDs = new Set(invocations.map((item) => item.id));
  const attemptIDs = new Set(invocations.flatMap((item) => item.attempts.map((attempt) => attempt.id)));
  const requireInvocation = (id: string, label: string) => {
    if (!invocationIDs.has(id)) throw invalid(path, `${label} refers to missing invocation "${id}"`);
  };
  const requireAttempt = (id: string, label: string) => {
    if (!attemptIDs.has(id)) throw invalid(path, `${label} refers to missing attempt "${id}"`);
  };
  relations.childRuns.forEach((item) => requireInvocation(item.parentInvocationId, 'child Run'));
  relations.childRunGroups.forEach((item) => requireInvocation(item.producerInvocationId, 'child Run group'));
  relations.waits.forEach((item) => { requireInvocation(item.invocationId, 'wait');requireAttempt(item.attemptId, 'wait'); });
  relations.effects.forEach((item) => { requireInvocation(item.invocationId, 'effect');requireAttempt(item.preparedAttemptId, 'effect'); });
  relations.runtimeGroups.forEach((item) => { requireInvocation(item.invocationId, 'runtime group');requireAttempt(item.preparedAttemptId, 'runtime group'); });
  relations.runtimes.forEach((item) => requireInvocation(item.invocationId, 'runtime'));
  relations.resources.forEach((item) => { requireInvocation(item.invocationId, 'resource');requireAttempt(item.boundAttemptId, 'resource'); });
}

function validateRelationGraph(relations: AutomationExecutionRelations, path: string) {
  validateChildRunGroupGraph(relations, path);
  const groupIDs = new Set(relations.runtimeGroups.map((item) => item.id));
  for (const runtime of relations.runtimes) {
    if (!groupIDs.has(runtime.groupId)) throw invalid(path, `runtime "${runtime.id}" refers to a missing group`);
    const group = relations.runtimeGroups.find((item) => item.id === runtime.groupId);
    if (group?.invocationId !== runtime.invocationId) throw invalid(path, `runtime "${runtime.id}" disagrees with its group invocation`);
    const stopping = runtime.state === 'stopping';
    const released = runtime.state === 'released';
    if ((stopping || released) !== Boolean(runtime.releaseStartedAt) || released !== Boolean(runtime.releasedAt)) {
      throw invalid(path, `runtime "${runtime.id}" has inconsistent release lifecycle facts`);
    }
  }
  for (const resource of relations.resources) {
    const lost = resource.state === 'lost';
    if (lost !== Boolean(resource.lostAt) || lost !== Boolean(resource.lossReason) ||
      (resource.state === 'released') !== Boolean(resource.releasedAt)) {
      throw invalid(path, `resource "${resource.id}" has inconsistent terminal lifecycle facts`);
    }
    if (resource.runtimeGroupId && !groupIDs.has(resource.runtimeGroupId)) {
      throw invalid(path, `resource "${resource.id}" refers to a missing runtime group`);
    }
    const group = resource.runtimeGroupId
      ? relations.runtimeGroups.find((item) => item.id === resource.runtimeGroupId)
      : undefined;
    if (group && group.invocationId !== resource.invocationId) {
      throw invalid(path, `resource "${resource.id}" disagrees with its runtime group invocation`);
    }
  }
}

function validateChildRunGroupGraph(relations: AutomationExecutionRelations, path: string) {
  const childByRun = new Map(relations.childRuns.map((item) => [item.childRunId,item]));
  const groupByID = new Map(relations.childRunGroups.map((item) => [item.id,item]));
  const membersByGroup = new Map<string,AutomationChildRunGroupMemberRelation[]>();
  for (const member of relations.childRunGroupMembers) {
    const group = groupByID.get(member.groupId);
    const child = childByRun.get(member.childRunId);
    if (!group || !child) throw invalid(path, `child Run group member "${member.id}" has no exact group and child link`);
    if (child.parentRunId !== group.parentRunId || child.rootRunId !== group.rootRunId ||
      child.parentInvocationId !== group.producerInvocationId || child.callNodeId !== group.producerNodeId ||
      child.ordinal !== member.ordinal || child.targetId !== group.targetId) {
      throw invalid(path, `child Run group member "${member.id}" disagrees with its child link`);
    }
    const dispatched = member.state === 'dispatched' || member.state === 'terminal' || member.state === 'cancel-requested';
    if ((dispatched && !child.boundAt) || (member.state === 'abandoned' && !child.launchAbandonedAt) ||
      dispatched !== Boolean(member.dispatchedAt) || (member.state === 'terminal') !== Boolean(member.terminalAt)) {
      throw invalid(path, `child Run group member "${member.id}" has inconsistent lifecycle facts`);
    }
    membersByGroup.set(member.groupId,[...(membersByGroup.get(member.groupId) ?? []),member]);
  }
  for (const group of relations.childRunGroups) {
    const members = membersByGroup.get(group.id) ?? [];
    if (members.length > group.expectedMembers || (group.state !== 'open' && members.length !== group.memberCount) ||
      (group.state === 'open' && group.memberCount !== 0) || group.terminalCount > group.memberCount || group.maxConcurrency > 1000) {
      throw invalid(path, `child Run group "${group.id}" has inconsistent cardinality`);
    }
    const terminal = group.state === 'resolved' || group.state === 'canceled';
    if (terminal !== Boolean(group.outcome) || terminal !== Boolean(group.resolvedAt) ||
      (group.state === 'canceled') !== (group.outcome === 'canceled') ||
      (group.state === 'open' && (group.membershipDigest || group.sealedAt)) ||
      (group.state !== 'open' && (!group.membershipDigest || !group.sealedAt))) {
      throw invalid(path, `child Run group "${group.id}" has inconsistent aggregate lifecycle facts`);
    }
    const ordinals = new Set(members.map((item) => item.ordinal));
    const itemKeys = new Set(members.map((item) => item.itemKey));
    const childRuns = new Set(members.map((item) => item.childRunId));
    if (ordinals.size !== members.length || itemKeys.size !== members.length || childRuns.size !== members.length) {
      throw invalid(path, `child Run group "${group.id}" repeats a member identity`);
    }
    if ((group.state === 'sealed' || group.state === 'resolved') && [...members].some((_, ordinal) => !ordinals.has(ordinal))) {
      throw invalid(path, `child Run group "${group.id}" member ordinals are not contiguous`);
    }
    if (group.winnerChildRunId && !childRuns.has(group.winnerChildRunId)) {
      throw invalid(path, `child Run group "${group.id}" resolution disagrees with its members`);
    }
  }
}

function rows<T>(value: unknown, schema: RowSchema, path: string): T[] {
  if (!Array.isArray(value)) throw invalid(path, 'must be an array');
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = object(entry, itemPath);
    exactKeys(item, [...Object.keys(schema.required),...Object.keys(schema.optional ?? {})], itemPath);
    for (const [key,rule] of Object.entries(schema.required)) validateField(item[key], rule, `${itemPath}.${key}`, true);
    for (const [key,rule] of Object.entries(schema.optional ?? {})) if (item[key] !== undefined) validateField(item[key], rule, `${itemPath}.${key}`, false);
    for (const [key,allowed] of Object.entries(schema.enums ?? {})) {
      if (item[key] !== undefined && !allowed.includes(item[key] as string)) throw invalid(`${itemPath}.${key}`, `has unsupported value "${String(item[key])}"`);
    }
    const id = item.id as string;
    if (ids.has(id)) throw invalid(path, `contains duplicate id "${id}"`);
    ids.add(id);
    return item as T;
  });
}

function strings(...keys: string[]) { return Object.fromEntries(keys.map((key) => [key,'string'])) as Record<string,Rule>; }
function addNumbers(schema: RowSchema, rules: Record<string,Rule>) { Object.assign(schema.required, rules); }
function addOptionalNumbers(schema:RowSchema,rules:Record<string,Rule>) { Object.assign(schema.optional ??= {},rules); }
function object(value: unknown, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(path, 'must be an object');
  return value as Record<string,unknown>;
}
function exactKeys(value: Record<string,unknown>, keys: string[], path: string) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw invalid(path, `contains unknown property "${key}"`);
}
function validateField(value: unknown, rule: Rule, path: string, required: boolean) {
  if (rule === 'string') {
    if (typeof value !== 'string' || (required && !value.trim())) throw invalid(path, required ? 'must be a non-empty string' : 'must be a string');
    return;
  }
  if (rule === 'boolean') {
    if (typeof value!=='boolean') throw invalid(path,'must be a boolean');
    return;
  }
  if (!Number.isSafeInteger(value) || (rule === 'positive' ? Number(value) < 1 : Number(value) < 0)) throw invalid(path, `must be a ${rule} integer`);
}
function requiredString(value: unknown, path: string) {
  validateField(value, 'string', path, true);
  return value as string;
}
function invalid(path: string, message: string) { return new Error(`Invalid Automation execution relations at ${path}: ${message}.`); }
