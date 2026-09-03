"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/browser/clipboard";
import {
  bookingSupportQuery,
  formatBookingSupportLabel,
  getBookingSupportPrompt,
  type BookingSupportAudience,
} from "@beautonomi/utils";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  bookingNumber?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  outstandingBalance?: number | null;
  audience: BookingSupportAudience;
  /** Path only, e.g. `/help/submit-ticket` — category and booking refs are appended. */
  supportPath: string;
};

export function BookingReferencePanel({
  bookingId,
  bookingNumber,
  status,
  paymentStatus,
  outstandingBalance,
  audience,
  supportPath,
}: Props) {
  const number = String(bookingNumber ?? "").trim();
  const prompt = getBookingSupportPrompt({
    status,
    paymentStatus,
    outstandingBalance,
    audience,
  });
  const supportLabel = formatBookingSupportLabel({ bookingNumber: number, bookingId });
  const supportHref = `${supportPath}${bookingSupportQuery({
    bookingId,
    bookingNumber: number || null,
    category: prompt.category,
  })}`;
  const [copied, setCopied] = useState<"number" | "id" | "both" | null>(null);

  async function copy(text: string, which: "number" | "id" | "both", label: string) {
    const ok = await copyTextToClipboard(text);
    if (!ok) {
      toast.error("Could not copy. Select the text instead.");
      return;
    }
    setCopied(which);
    toast.success(`${label} copied`);
    window.setTimeout(() => setCopied((current) => (current === which ? null : current)), 1800);
  }

  const CopyBtn = ({
    which,
    text,
    label,
  }: {
    which: "number" | "id" | "both";
    text: string;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => void copy(text, which, label)}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {copied === which ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied === which ? "Copied" : "Copy"}
    </button>
  );

  return (
    <div className="mb-6 space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        {number ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Booking number</p>
              <p className="mt-1 select-all text-xl font-semibold tracking-tight text-gray-900">{number}</p>
            </div>
            <CopyBtn which="number" text={number} label="Booking number" />
          </div>
        ) : null}
        <div className={cn("flex items-start justify-between gap-3", number ? "mt-4 border-t border-gray-100 pt-4" : "")}>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Booking ID</p>
            <p className="mt-1 break-all font-mono text-sm text-gray-800 select-all">{bookingId}</p>
          </div>
          <CopyBtn which="id" text={bookingId} label="Booking ID" />
        </div>
        {number ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void copy(supportLabel, "both", "Booking reference")}
              className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
            >
              {copied === "both" ? "Number and ID copied" : "Copy number and ID"}
            </button>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "rounded-2xl border p-4",
          prompt.prominence === "urgent"
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-gray-50",
        )}
      >
        <div className="flex items-start gap-3">
          <LifeBuoy
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              prompt.prominence === "urgent" ? "text-amber-700" : "text-gray-500",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-semibold",
                prompt.prominence === "urgent" ? "text-amber-950" : "text-gray-900",
              )}
            >
              {prompt.title}
            </p>
            <p
              className={cn(
                "mt-1 text-sm",
                prompt.prominence === "urgent" ? "text-amber-900" : "text-gray-600",
              )}
            >
              {prompt.body}
            </p>
            <Link
              href={supportHref}
              className={cn(
                "mt-3 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium",
                prompt.prominence === "urgent"
                  ? "bg-amber-800 text-white hover:bg-amber-900"
                  : "bg-white text-gray-800 ring-1 ring-gray-200 hover:bg-gray-100",
              )}
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
