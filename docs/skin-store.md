# Explicit skin stores in 0.17

`@xgc2/ui-react` owns the document skin and React subscriptions. A product's
existing preferences owner owns the stored value, startup restoration, transport,
revision checks, commit order, and cross-window notifications. Theme preferences
are part of that existing configuration; do not create a separate theme service.
The library has no localStorage, IndexedDB, storage key, storage event handler,
implicit global store, or persistence fallback.

## Public API

```ts
import {
  createMemorySkinStore,
  initializeSkin,
  useSkin,
  type XGCSkin,
} from '@xgc2/ui-react';

interface SkinStore {
  getSnapshot(): XGCSkin; // 'light' | 'dark', synchronously available
  subscribe(listener: () => void): () => void;
  setSkin(next: XGCSkin): Promise<void>;
}
```

Pass `{ store }` explicitly to both `initializeSkin` and `useSkin`. Keep the store
identity stable and share one document theme authority across components. Creating
a store during each render discards subscriptions and ownership. Independent
preview skins belong on a scoped preview element, not another document owner.

`getSnapshot` returns the current committed value without I/O or side effects.
Restore and validate the product preferences before exposing the store. A default
for a missing saved preference is an explicit product choice. A failed restore is
handled by the product startup flow, never silently turned into a saved default.
For SSR, provide the same initial snapshot to the server and hydration render.

`subscribe` registers a callback and returns its cleanup. The owner notifies on
snapshot changes, including changes received from other windows or clients. Each
registration has an independent cleanup; notification callbacks must return
normally. React's external-store subscription owns mount/unmount and StrictMode
cleanup. The store must not perform a persistent write merely because something
subscribes or reads its snapshot.

`setSkin` returns a promise. On success the owner publishes the committed snapshot
and notifies subscribers before resolving. On failure it rejects with the actual
error, without replacing the authority with the failed request's value. The owner
also handles uncertain transport outcomes and refreshes its authority as needed.
React does not optimistically replace the theme or retry a failed request.

The hook setter accepts a skin or `(current) => next`. An updater runs once against
`store.getSnapshot()` at the time of the call, not after another pending write.
Two concurrent toggles may therefore request the same value. The owner defines
ordering and conflict handling; the hook adds no queue, lock, admission gate, or
revision system. Products may display their own pending/error state. A promise
resolution is a commit acknowledgement, not a guarantee that React has completed
its next DOM effect. DOM updates always read the current authority, never an old
request value when its promise completes.

## Managed preferences

The following illustrates the call sequence, not a new persistence abstraction.
`preferences` is the product's existing owner, including its revision and storage
location. Its methods in this example stand for the corresponding product API.

```tsx
// Startup: await an existing owner before the first React render.
await preferences.restore();
const skinStore: SkinStore = {
  getSnapshot: () => preferences.getSnapshot().skin,
  subscribe: (listener) => preferences.subscribe(listener),
  setSkin: (skin) => preferences.updateSkin(skin),
};
initializeSkin({ store: skinStore });
createRoot(root).render(<App skinStore={skinStore} />);

// A user action initiates a persistent write and observes its outcome.
function SkinChoice({ store }: { store: SkinStore }) {
  const [skin, setSkin] = useSkin({ store });
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setError(null);
    try {
      await setSkin((current) => current === 'light' ? 'dark' : 'light');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return <>
    <Button onClick={toggle}>Theme: {skin}</Button>
    {error && <p role="alert">{error}</p>}
  </>;
}
```

The product must identify which existing preference operation commits the value
and where that owner stores it. Neither initialization nor mounting performs that
operation. Do not swallow persistence errors, recreate browser storage inside a
store adapter, or write `document.documentElement` in product code.

## Explicit memory mode

Demos and applications that intentionally do not save preferences can choose:

```tsx
const skinStore = createMemorySkinStore('light');
initializeSkin({ store: skinStore });
// Pass this same skinStore to useSkin({ store: skinStore }).
```

The memory store updates its snapshot and notifies synchronously; its setter is
still awaitable. It does not survive a reload. It is not a fallback for failed
managed persistence. The manuscript demo uses this explicit mode.

## Migration and release boundary

- Replace `SkinStorageOptions`, `storageKey`, `defaultSkin`, and `readStoredSkin`
  with an explicit `SkinStore`; these old exports/options are removed.
- Await the product owner restore, then call `initializeSkin({ store })` before
  rendering. Remove inline theme scripts and product document theme mutations.
- Pass the same stable store to each `useSkin({ store })`; await or catch every
  user-triggered setter promise so the UI can display failures.
- Preserve the product owner's revision/conflict handling and storage location.
  The shared library does not migrate old browser data or persist initialization.
- Run the matching `@xgc2/ui-policy` against the actual product source. Injected
  stores pass; the validator detects the covered direct document theme mutation
  and direct `localStorage` theme-key patterns. It does not detect every browser
  persistence mechanism or prove owner behavior. Browser theme persistence remains
  prohibited; verify managed persistence, restoration, and conflict handling
  separately.

The prepared family is React/policy **0.17.0**, workflow **0.4.2** (React peer
`>=0.17 <1`), and unchanged tokens **0.11.0**. Source preparation and local checks
are not publication. Consumers must use the matching immutable released tarballs
and update their lockfiles after the separate release workflow has completed.
Downstream consumer changes are not included in this shared-repository change.
