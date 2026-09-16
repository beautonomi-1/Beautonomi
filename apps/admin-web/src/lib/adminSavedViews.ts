/**
 * Reusable saved-view chip pattern for admin list queues.
 * Extracted from the support tickets saved-view implementation.
 */
export interface AdminSavedView<TParams> {
  id: string;
  label: string;
  params: Partial<TParams>;
}

export type SavedViewFieldMatcher<TState> = (
  current: TState,
  paramValue: unknown,
  key: keyof TState,
) => boolean;

/** Default matcher: booleans compare strictly; other fields fall back to `defaults`. */
export function createDefaultSavedViewMatcher<TState extends object>(
  defaults: Partial<TState>,
): SavedViewFieldMatcher<TState> {
  return (current, paramValue, key) => {
    const expected = paramValue ?? defaults[key];
    const actual = (current as Record<keyof TState, unknown>)[key];
    if (typeof expected === "boolean") return Boolean(actual) === expected;
    return (actual ?? defaults[key]) === expected;
  };
}

/** Returns the saved-view id that matches the current filter state, or null. */
export function matchAdminSavedView<TState extends object>(
  views: AdminSavedView<TState>[],
  current: TState,
  keys: (keyof TState)[],
  matcher: SavedViewFieldMatcher<TState>,
): string | null {
  for (const view of views) {
    const p = view.params;
    const matches = keys.every((key) => matcher(current, p[key], key));
    if (matches) return view.id;
  }
  return null;
}
