import { fireEvent,waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export async function handoverWorkflowStartup(role: string) {
  const query = () => document.querySelector(`[data-xgc-role="${role}"]`);
  await waitFor(() => {
    expect(query()).not.toBeNull();
  });
  let guard = 0;
  while (query()) {
    const root = query();
    if (!root) break;
    if (root.getAttribute('data-xgc-visual-complete') === 'true') break;
    const passedBefore = root.querySelectorAll('[data-passed="true"]').length;
    const send = root.querySelector('[data-sending="true"] .workflow-startup-pipeline-send');
    if (!send) {
      throw new Error(`${role} is not sending a startup rail`);
    }
    fireSendFinished(send);
    await waitFor(() => {
      const next = query();
      if (!next) return;
      if (next.getAttribute('data-xgc-visual-complete') === 'true') return;
      expect(next.querySelectorAll('[data-passed="true"]').length).toBeGreaterThan(passedBefore);
    });
    guard += 1;
    if (guard > 8) throw new Error(`${role} startup rails did not reach a visible complete state`);
  }
  await waitFor(() => {
    expect(query()).toBeNull();
  });
}

function fireSendFinished(send: Element) {
  fireEvent.animationEnd(send, {
    animationName: 'workflow-startup-send',
    elapsedTime: 1.6,
    bubbles: true,
    pseudoElement: '',
  });
}
