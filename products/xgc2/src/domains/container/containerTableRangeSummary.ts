/** Range label, optionally prefixed with a non-zero selection count. */
export function containerTableRangeSummary({
  total,
  rangeStart,
  rangeEnd,
  selectedCount = 0,
  emptyLabel,
}: {
  total: number;
  rangeStart: number;
  rangeEnd: number;
  selectedCount?: number;
  emptyLabel: string;
}): string {
  if (total === 0) return emptyLabel;
  const range = `Showing ${rangeStart}–${rangeEnd} of ${total}`;
  return selectedCount > 0 ? `${selectedCount} selected · ${range}` : range;
}
