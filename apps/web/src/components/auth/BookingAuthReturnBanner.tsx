"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import type { BookingReturnContext } from "@/lib/booking/booking-return-context";

type Props = {
  context: BookingReturnContext;
  /** "login" | "signup" — affects title key only. */
  variant: "login" | "signup";
};

export function BookingAuthReturnBanner({ context, variant }: Props) {
  const { t } = useTranslation();
  const titleKey =
    variant === "login"
      ? "web.auth.bookingReturn.titleLogin"
      : "web.auth.bookingReturn.titleSignup";

  return (
    <div
      className="mb-6 rounded-xl border border-primary/20 bg-primary/[0.06] p-4 text-left"
      role="status"
    >
      <p className="text-sm font-semibold text-gray-900 mb-1">{t(titleKey)}</p>
      <p className="text-sm text-gray-600 mb-3">{t(context.stepLabelKey)}</p>
      <Link
        href={context.continueHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("web.auth.bookingReturn.continueBooking")}
      </Link>
    </div>
  );
}
