"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";

export default function OnDemandResultPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "expired";
  const onDemandConfig = useModuleConfig("on_demand");
  const uiCopy = (onDemandConfig?.ui_copy ?? {}) as Record<string, string>;

  const isAccepted = status === "accepted";
  const title = isAccepted
    ? (uiCopy.accepted_title ?? "Request accepted!")
    : status === "declined"
      ? (uiCopy.declined_title ?? "Not accepted")
      : status === "cancelled"
        ? "Request cancelled"
        : (uiCopy.expired_title ?? "Request expired");
  const subtitle = isAccepted
    ? (uiCopy.accepted_subtitle ?? "Your booking is confirmed. View details below.")
    : status === "declined"
      ? (uiCopy.declined_subtitle ?? "The provider was unable to accept. Try another time or book a scheduled appointment.")
      : status === "cancelled"
        ? "You cancelled this request."
        : (uiCopy.expired_subtitle ?? "The request timed out. You can try again or book a scheduled appointment.");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 max-w-md mx-auto">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
          isAccepted ? "bg-green-100" : "bg-gray-100"
        }`}
      >
        {isAccepted ? (
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        ) : (
          <Clock className="h-12 w-12 text-gray-500" />
        )}
      </div>
      <h1 className="text-xl font-semibold text-gray-900 text-center">{title}</h1>
      <p className="text-gray-600 text-center mt-2">{subtitle}</p>

      <div className="flex flex-col gap-3 w-full mt-8">
        <Button asChild>
          <Link href="/account-settings/bookings">View my bookings</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
