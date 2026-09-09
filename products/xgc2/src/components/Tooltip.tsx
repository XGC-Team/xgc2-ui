import type { ReactNode } from 'react';
import { Tooltip as SharedTooltip } from '@xgc2/ui-react';
import { useFieldTooltipsEnabled } from '../hooks/useFieldTooltipsEnabled';

const SHOW_DELAY_MS = 200;

/**
 * Product preference adapter around the family-wide tooltip implementation.
 * Geometry, timing, keyboard intent, portal and scroll-dismiss behavior live
 * in @xgc2/ui-react; XGC2 only owns the operator's enabled/disabled preference.
 *
 * The family trigger is display:contents, so no extra wrapper is needed here:
 * a contents glue div would sit between the config/form-section body and its
 * `.xgc-form-field` children and break the `>` child selectors (incident
 * form-field-contents-glue-layout-2026-09-04).
 */
export function Tooltip({
  content,
  children,
  className = '',
  delayMs = SHOW_DELAY_MS,
  dataXgcId,
}: {
  content?: string;
  children: ReactNode;
  className?: string;
  delayMs?: number;
  dataXgcId?: string;
}) {
  const fieldTooltipsEnabled = useFieldTooltipsEnabled();
  return (
    <SharedTooltip
      className={className}
      content={content}
      dataXgcId={dataXgcId}
      delayMs={delayMs}
      enabled={fieldTooltipsEnabled}
    >
      {children}
    </SharedTooltip>
  );
}