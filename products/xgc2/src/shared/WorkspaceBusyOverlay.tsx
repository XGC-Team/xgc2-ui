import './WorkspaceBusyOverlay.css';

/** Covers this workspace or System tab until that surface has a complete first screen. */
export function WorkspaceBusyOverlay({
  id = 'workspace',
  label = 'Loading workspace',
}: {
  id?: string;
  label?: string;
}) {
  return (
    <div
      data-xgc-role="workspace-busy-overlay"
      data-xgc-id={id}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="xgc-workspace-busy-ring" aria-hidden="true" />
    </div>
  );
}
