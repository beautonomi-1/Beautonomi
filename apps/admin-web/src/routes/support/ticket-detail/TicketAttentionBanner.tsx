import { AlertTriangle } from "lucide-react";
import type { AttentionBanner } from "@/routes/support/ticket-detail/ticketDetailHelpers";

export function TicketAttentionBanner({ banner }: { banner: AttentionBanner }) {
  if (!banner) return null;
  const styleClass =
    banner.style === "red"
      ? "bg-red-50 text-red-800 border border-red-200"
      : banner.style === "amber"
        ? "bg-amber-50 text-amber-800 border border-amber-200"
        : "bg-blue-50 text-blue-800 border border-blue-200";

  return (
    <div className={`flex shrink-0 items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium ${styleClass}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{banner.text}</span>
    </div>
  );
}
