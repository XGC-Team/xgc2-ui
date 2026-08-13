import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

type OverlayRegistration = {
  close: () => void;
  dismissible: boolean;
  id: string;
  ownerId?: string;
  rootRef: RefObject<HTMLElement | null>;
};

const overlayStack: OverlayRegistration[] = [];
const OverlayOwnerContext = createContext<string | undefined>(undefined);
const boundDocuments = new WeakSet<Document>();
let overlayIdSequence = 0;

function dismissTopmost(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return;
  const top = topOverlay();
  if (!top) return;
  queueMicrotask(() => {
    if (event.defaultPrevented || topOverlay()?.id !== top.id) return;
    event.preventDefault();
    if (top.dismissible) top.close();
  });
}

function bindOverlayListener(document: Document) {
  if (boundDocuments.has(document)) return;
  boundDocuments.add(document);
  document.addEventListener('keydown', dismissTopmost, true);
}

function topOverlay() {
  return overlayStack.at(-1);
}

function closeTopOverlayForEvent(event: KeyboardEvent | React.KeyboardEvent) {
  const composing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing;
  if (event.defaultPrevented || composing || event.key !== 'Escape') return false;
  const top = topOverlay();
  if (!top) return false;
  event.preventDefault();
  if (top.dismissible) top.close();
  return true;
}

export function useOverlayStack({
  close,
  dismissible = true,
  open,
  ownerId,
  rootRef,
}: {
  close: () => void;
  dismissible?: boolean;
  open: boolean;
  ownerId?: string;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) idRef.current = `xgc-overlay-${overlayIdSequence += 1}`;
  const id = idRef.current;
  const closeRef = useRef(close);
  closeRef.current = close;
  const inheritedOwnerId = useContext(OverlayOwnerContext);
  const resolvedOwnerId = ownerId ?? inheritedOwnerId;
  const closeTopOverlay = useCallback(closeTopOverlayForEvent, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    bindOverlayListener(document);
    const registration = {
      close: () => closeRef.current(),
      dismissible,
      id,
      ownerId: resolvedOwnerId,
      rootRef,
    };
    const firstOwnedOverlay = overlayStack.findIndex((entry) => overlayBelongsTo(entry, id));
    if (firstOwnedOverlay >= 0) overlayStack.splice(firstOwnedOverlay, 0, registration);
    else overlayStack.push(registration);
    return () => {
      const index = overlayStack.findIndex((entry) => entry.id === id);
      if (index >= 0) overlayStack.splice(index, 1);
    };
  }, [dismissible, id, open, resolvedOwnerId, rootRef]);

  return { closeTopOverlay, overlayId: id };
}

export function OverlayOwner({ children, id }: { children: ReactNode; id: string }) {
  return <OverlayOwnerContext value={id}>{children}</OverlayOwnerContext>;
}

export function isInsideOwnedOverlay(node: Node | null, ownerId?: string) {
  if (!node || !ownerId) return false;
  return overlayStack.some((overlay) => (
    overlayBelongsTo(overlay, ownerId) && Boolean(overlay.rootRef.current?.contains(node))
  ));
}

function overlayBelongsTo(overlay: OverlayRegistration, ownerId: string) {
  let candidateOwner = overlay.ownerId;
  const visited = new Set<string>();
  while (candidateOwner && !visited.has(candidateOwner)) {
    if (candidateOwner === ownerId) return true;
    visited.add(candidateOwner);
    candidateOwner = overlayStack.find((candidate) => candidate.id === candidateOwner)?.ownerId;
  }
  return false;
}

export function useOverlayEscapeHandler() {
  return useCallback(closeTopOverlayForEvent, []);
}
