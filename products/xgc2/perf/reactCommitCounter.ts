/**
 * Counts which components React actually rendered in each commit, the same way
 * React DevTools' profiler decides "did this fiber render": a fiber rendered
 * when it mounted or carries PerformedWork, and a subtree whose child pointer
 * is shared with the previous tree bailed out and is not walked.
 *
 * Import this module before react-dom loads (first import of a perf file):
 * react-dom registers with __REACT_DEVTOOLS_GLOBAL_HOOK__ once, at load.
 */

type Fiber = {
  tag: number;
  type: unknown;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  flags: number;
};

type FiberRoot = { current: Fiber };

export type CommitSample = {
  /** Component renders by display name. */
  renders: Map<string,number>;
  /** Host (DOM element/text) fibers committed with an Update flag. */
  hostUpdates: number;
  commits: number;
};

const FunctionComponent = 0;
const ClassComponent = 1;
const HostComponent = 5;
const HostText = 6;
const ForwardRef = 11;
const SimpleMemoComponent = 15;
const PerformedWork = 1;
const Update = 4;

let active = false;
let sample: CommitSample = emptySample();

function emptySample(): CommitSample {
  return { renders: new Map(),hostUpdates: 0,commits: 0 };
}

function displayName(type: unknown): string | undefined {
  if (!type) return undefined;
  if (typeof type === 'function') {
    const named = type as { displayName?: string;name?: string };
    return named.displayName || named.name || 'Anonymous';
  }
  if (typeof type === 'object') {
    const object = type as { displayName?: string;render?: unknown;type?: unknown };
    return object.displayName || displayName(object.render) || displayName(object.type);
  }
  return undefined;
}

function componentName(fiber: Fiber) {
  switch (fiber.tag) {
    case FunctionComponent:
    case ClassComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      return displayName(fiber.type);
    default:
      return undefined;
  }
}

function record(fiber: Fiber, rendered: boolean) {
  const name = componentName(fiber);
  if (name && rendered) sample.renders.set(name,(sample.renders.get(name) ?? 0) + 1);
  if (!name && rendered && (fiber.tag === HostComponent || fiber.tag === HostText)) sample.hostUpdates += 1;
}

function mount(fiber: Fiber) {
  for (let current: Fiber | null = fiber; current; current = current.sibling) {
    record(current,true);
    if (current.child) mount(current.child);
  }
}

function update(next: Fiber, previous: Fiber) {
  const name = componentName(next);
  if (name) record(next,(next.flags & PerformedWork) === PerformedWork);
  else if (next.tag === HostComponent || next.tag === HostText) record(next,(next.flags & Update) === Update);
  if (next.child === previous.child) return;
  for (let child = next.child; child; child = child.sibling) {
    if (child.alternate) update(child,child.alternate);
    else {
      record(child,true);
      if (child.child) mount(child.child);
    }
  }
}

function onCommitFiberRoot(_rendererId: number, root: FiberRoot) {
  if (!active) return;
  sample.commits += 1;
  const current = root.current;
  if (current.alternate) update(current,current.alternate);
  else if (current.child) mount(current.child);
}

const globalScope = globalThis as typeof globalThis & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
if (!globalScope.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  let rendererId = 0;
  globalScope.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => { rendererId += 1;return rendererId; },
    checkDCE: () => undefined,
    onScheduleFiberRoot: () => undefined,
    onCommitFiberRoot,
    onCommitFiberUnmount: () => undefined,
    onPostCommitFiberRoot: () => undefined,
    setStrictMode: () => undefined,
  };
}

/** Start a fresh sample; commits outside start/stop are ignored. */
export function startCommitSample() {
  sample = emptySample();
  active = true;
}

export function stopCommitSample(): CommitSample {
  active = false;
  return sample;
}

/**
 * Sum renders, optionally of the named components. Bundlers may suffix an
 * inner function name to avoid a collision (memo(function Card) -> Card2).
 */
export function totalRenders(value: CommitSample, names?: readonly string[]) {
  let total = 0;
  value.renders.forEach((count,name) => {
    if (!names || names.includes(name.replace(/\d+$/,''))) total += count;
  });
  return total;
}
