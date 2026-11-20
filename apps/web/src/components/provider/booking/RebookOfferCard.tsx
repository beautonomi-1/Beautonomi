"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

type RebookPreview = {
  existingOffer?: {
    id: string;
    status: string;
    openedAt: string | null;
    sentAt: string | null;
    bookedAt: string | null;
  } | null;
  channel?: string;
};

function statusLabel(status: string, channel: string | undefined, t: (k: string) => string): string {
  if (status === "booked") return t("web.provider.postCompletion.rebookStatusBooked");
  if (status === "opened") return t("web.provider.postCompletion.rebookStatusOpened");
  if (status === "sent") return t("web.provider.postCompletion.rebookStatusSent");
  if (status === "handed_to_whatsapp") return t("web.provider.postCompletion.rebookStatusWhatsApp");
  if (status === "expired") return t("web.provider.postCompletion.rebookStatusExpired");
  if (status === "cancelled") return t("web.provider.postCompletion.rebookStatusCancelled");
  if (status === "pending" && channel === "none") return "";
  return status;
}

export function RebookOfferCard({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<RebookPreview | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetcher
      .get<{ data?: RebookPreview } & RebookPreview>(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`)
      .then((res) => setPreview((res.data ?? res) as RebookPreview))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const offer = preview?.existingOffer;
  if (loading || !offer?.status || offer.status === "cancelled") return null;
  if (offer.status === "pending") return null;

  const label = statusLabel(offer.status, preview?.channel, t);
  if (!label) return null;

  const canRelease = ["handed_to_whatsapp", "sent", "opened"].includes(offer.status);

  const release = async () => {
    try {
      await fetcher.delete(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`);
      toast.success(t("web.provider.postCompletion.rebookReleased"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("web.provider.postCompletion.shareFailed"));
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium text-foreground">{t("web.provider.postCompletion.rebookStatusTitle")}</p>
      <p className="text-muted-foreground">{label}</p>
      {canRelease ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void release()}>
          {t("web.provider.postCompletion.rebookRelease")}
        </Button>
      ) : null}
    </div>
  );
}