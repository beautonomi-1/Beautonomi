/**
 * Router `state` for navigations that did not come from the sidebar (global search, ⌘K, Copilot,
 * deep links) so the shell scrolls the matching nav row into view and briefly highlights it.
 */
export const NAV_REVEAL_STATE = { navReveal: true } as const;

export function isNavRevealState(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as { navReveal?: unknown }).navReveal === true;
}

/**
 * Scroll `target` inside `container` only when it is (partly) hidden, centring it.
 * `topInset` accounts for sticky headers inside the scroll container.
 */
export function revealInScrollContainer(
  container: HTMLElement,
  target: HTMLElement,
  opts: { topInset?: number; smooth?: boolean } = {},
): void {
  const topInset = opts.topInset ?? 0;
  const c = container.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const visibleTop = c.top + topInset;
  if (t.top >= visibleTop && t.bottom <= c.bottom) return;
  const offsetWithin = t.top - c.top + container.scrollTop;
  const top = Math.max(0, offsetWithin - (container.clientHeight - t.height) / 2);
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  container.scrollTo({ top, behavior: opts.smooth && !reduceMotion ? "smooth" : "auto" });
}
