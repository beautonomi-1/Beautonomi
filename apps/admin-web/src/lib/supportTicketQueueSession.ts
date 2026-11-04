import { adminSpaTo } from "@/lib/adminSpaPath";

export const SUPPORT_TICKETS_QUEUE_UI_SEARCH_KEY = "admin_support_tickets_queue_ui_search";

/** Persist current queue filters (without `selected`) for Back to queue links. */
export function saveSupportTicketsQueueUiSearch(searchParams: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const n = new URLSearchParams(searchParams);
  n.delete("selected");
  const qs = n.toString();
  window.sessionStorage.setItem(SUPPORT_TICKETS_QUEUE_UI_SEARCH_KEY, qs);
}

export function readSupportTicketsQueueUiSearch(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(SUPPORT_TICKETS_QUEUE_UI_SEARCH_KEY) ?? "";
}

export function supportTicketsQueueHref(): string {
  const qs = readSupportTicketsQueueUiSearch();
  if (!qs) return adminSpaTo("/admin/support-tickets");
  return adminSpaTo(`/admin/support-tickets?${qs}`);
}
