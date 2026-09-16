const ADMIN_FORMAT_LOCALE = "en-ZA";

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(ADMIN_FORMAT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAdminRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const mins = Math.round(absMs / 60_000);
  const hours = Math.round(absMs / 3_600_000);
  const days = Math.round(absMs / 86_400_000);

  if (mins < 1) return diffMs >= 0 ? "in a moment" : "just now";
  if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
  if (hours < 24) return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
  if (days < 7) return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
  return formatAdminDateTime(iso);
}

export function formatAdminExpiry(iso: string | null | undefined): { text: string; expired: boolean } {
  if (!iso) return { text: "No expiry", expired: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "Expired", expired: true };
  const hours = Math.round(ms / 3_600_000);
  if (hours >= 24) return { text: `Expires in ${Math.round(hours / 24)} days`, expired: false };
  if (hours >= 1) return { text: `Expires in ${hours}h`, expired: false };
  const mins = Math.max(1, Math.round(ms / 60_000));
  return { text: `Expires in ${mins}m`, expired: false };
}
