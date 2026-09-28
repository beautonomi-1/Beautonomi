/**
 * Public iCal feed: first name + last initial (PII minimization).
 */
export function formatCustomerNameForCalendarFeed(fullName: string | null | undefined): string {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return "";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;

  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]!.charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

export function formatCalendarEventSummary(params: {
  customerFullName?: string | null;
  bookingNumber?: string | null;
}): string {
  const name = formatCustomerNameForCalendarFeed(params.customerFullName);
  const number = params.bookingNumber?.trim() || "Booking";
  if (name) return `${name} - ${number}`;
  return number;
}
