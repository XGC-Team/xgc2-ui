import { memo,type ReactNode } from 'react';
import type { PanelInstance } from '../experimentModel';

/** Keep geometry-only workspace updates outside the panel's content tree.
 * Real panel/render inputs and descendant state or subscriptions still update.
 * No host element is added, so the panel keeps its existing DOM and selectors.
 */
export const DashboardPanelContent = memo(function DashboardPanelContent({ panel,renderPanel }: {
  panel: PanelInstance;
  renderPanel: (panel: PanelInstance) => ReactNode;
}) {
  return renderPanel(panel);
});
