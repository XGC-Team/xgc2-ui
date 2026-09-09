export function recordWithoutKey<T>(items: Record<string,T>, key: string) {
  if (!(key in items)) return items;
  const next = { ...items };
  delete next[key];
  return next;
}
