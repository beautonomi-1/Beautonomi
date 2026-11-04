export type SupportTicketSelectedNavAction = "noop" | "clear_selected" | "open_full_page";

/**
 * How to handle `?selected=` when viewport or view mode changes.
 * - open_full_page: mobile-first load with no prior desktop session (split pane unavailable)
 * - clear_selected: stay on queue (table view or shrink from desktop)
 */
export function resolveSupportTicketSelectedNavAction(input: {
  selectedId: string | null;
  isDesktop: boolean;
  isTableView: boolean;
  /** Session saw desktop width at least once */
  everDesktop: boolean;
  /** Previous render was desktop (for shrink detection) */
  wasDesktop: boolean;
}): SupportTicketSelectedNavAction {
  if (!input.selectedId) return "noop";
  if (input.isTableView) return "clear_selected";
  if (input.isDesktop) return "noop";
  if (input.everDesktop && input.wasDesktop) return "clear_selected";
  if (!input.everDesktop) return "open_full_page";
  return "clear_selected";
}
