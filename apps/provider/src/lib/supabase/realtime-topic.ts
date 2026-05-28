/**
 * Monotonic Realtime channel suffix — survives component unmount/remount.
 * Supabase reuses channel instances by topic name; a remounted screen that
 * picks the same suffix as a not-yet-removed channel throws
 * "cannot add postgres_changes callbacks after subscribe()".
 */
const seqByPrefix = new Map<string, number>();

export function nextRealtimeTopic(prefix: string): string {
  const next = (seqByPrefix.get(prefix) ?? 0) + 1;
  seqByPrefix.set(prefix, next);
  return `${prefix}:${next}`;
}
