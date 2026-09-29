import { Suspense } from 'react';
import { useDeferRouteReady } from '../../../shared/routeReady';
import { formatOperatorDateTime } from '../../../shared/operatorTime';
import { useSharedSurfaceEntry } from './useSharedSurfaceEntry';
import '../../../styles/access-entry.css';

/** A guest host selects exactly one compiled owner; it has no main-station app/store fallback. */
export function AccessEntryPage() {
  const { state, active, leave } = useSharedSurfaceEntry();
  useDeferRouteReady(state.phase === 'connecting');

  return (
    <div className="access-entry-shell" data-xgc-role="access-entry-shell" data-xgc-id="access-entry-shell">
      {state.phase === 'connecting' ? <SharedSurfaceLoading /> : null}
      {state.phase === 'denied' ? (
        <div className="access-entry-status" data-xgc-role="access-entry-denied" data-xgc-id="access-entry-denied">
          链接无效、已过期或此功能不可用。
        </div>
      ) : null}
      {state.phase === 'closed' ? (
        <div className="access-entry-status" data-xgc-role="access-entry-closed" data-xgc-id="access-entry-closed">
          该分享已停止、撤销或发生变化，请重新打开有效链接。
        </div>
      ) : null}
      {state.phase === 'leaving' ? (
        <div className="access-entry-status" role="status">正在撤销此访问会话，本地控件已停止。</div>
      ) : null}
      {state.phase === 'left' ? (
        <div className="access-entry-status" role="status" data-xgc-role="access-entry-left" data-xgc-id="access-entry-left">
          {state.cleanupPending
            ? '此访问会话已撤销，服务端仍在释放其资源；尚未确认释放完成。'
            : '此访问会话已退出，所属资源已释放。'}
        </div>
      ) : null}
      {state.phase === 'leave-error' ? (
        <div className="access-entry-status" role="alert">
          无法确认服务端退出结果。本地控件已停止，请由主站核实会话与资源状态。
          <button type="button" onClick={() => { void leave(); }}>重试退出</button>
        </div>
      ) : null}
      {active ? (
        <>
          <header className="access-entry-header" data-xgc-role="access-entry-header" data-xgc-id={active.projection.entryId}>
            <strong>{active.projection.name}</strong>
            <button type="button" onClick={() => { void leave(); }}>退出此访问会话</button>
            <span className="access-entry-header-meta">{formatOperatorDateTime(active.projection.expiresAt)}</span>
          </header>
          <main className="access-entry-main">
            <Suspense fallback={<SharedSurfaceLoading />}>
              <active.contribution.component projection={active.projection} client={active.client} />
            </Suspense>
          </main>
        </>
      ) : null}
    </div>
  );
}

function SharedSurfaceLoading() {
  useDeferRouteReady(true);
  return <div className="access-entry-spinner" role="status" aria-label="Connecting" />;
}
