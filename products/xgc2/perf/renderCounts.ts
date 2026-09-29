/** Render counters shared by the perf harness mocks; no application imports. */
export const renderCounts = new Map<string,number>();
export function countRender(key:string) {
  renderCounts.set(key,(renderCounts.get(key) ?? 0) + 1);
}
