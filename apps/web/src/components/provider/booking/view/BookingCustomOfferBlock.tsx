"use client";

import { useTranslation } from "@beautonomi/i18n";

import type { Appointment } from "@/lib/provider-portal/types";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export function BookingCustomOfferBlock({ appointment }: { appointment: Appointment }) {
  const { t } = useTranslation();
  const raw = appointment as unknown as Record<string, unknown>;
  const offer = raw.custom_offer as { request?: { description?: string }; notes?: string } | undefined;
  if (!offer && !raw.custom_offer_id) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">{t("web.messaging.whatsappChat.previewCustomOffer")}</BookingSectionLabel>
      {offer?.request?.description ? (
        <p className="text-sm text-gray-700">{offer.request.description}</p>
      ) : null}
      {offer?.notes ? <p className="text-xs text-gray-500 mt-1">{offer.notes}</p> : null}
    </BookingSectionCard>
  );
}
