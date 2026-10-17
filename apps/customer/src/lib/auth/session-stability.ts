import type { User } from "@supabase/supabase-js";

export function isSameAuthUser(prev: User | null, next: User | null): boolean {
  if (!prev || !next) return prev === next;
  return (
    prev.id === next.id &&
    prev.updated_at === next.updated_at &&
    prev.email === next.email &&
    prev.phone === next.phone &&
    JSON.stringify(prev.user_metadata ?? {}) === JSON.stringify(next.user_metadata ?? {}) &&
    JSON.stringify(prev.app_metadata ?? {}) === JSON.stringify(next.app_metadata ?? {})
  );
}
