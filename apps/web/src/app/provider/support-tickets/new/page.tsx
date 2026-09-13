"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS,
} from "@/lib/support/ticket-categories";
import { resolveBookingSupportTicketPrefill } from "@beautonomi/utils";

const DEFAULT_CATEGORY =
  SUPPORT_TICKET_CATEGORY_GROUPS[0]?.items[0]?.value ?? "account_sign_in";

export default function ProviderNewSupportTicketPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingPrefill = useMemo(
    () =>
      resolveBookingSupportTicketPrefill({
        bookingId: searchParams.get("booking_id"),
        bookingNumber: searchParams.get("booking_number"),
        category: searchParams.get("category"),
      }),
    [searchParams],
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bookingPrefill.category) {
      setCategory(bookingPrefill.category);
    }
    if (bookingPrefill.supportContextType === "booking" && bookingPrefill.supportContextLabel) {
      setSubject((current) =>
        current.trim()
          ? current
          : t("web.provider.pages.support-tickets/new.helpWithBooking", { label: bookingPrefill.supportContextLabel.split(" (")[0] }),
      );
    }
  }, [bookingPrefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error(t("web.provider.pages.support-tickets/new.enterSubjectAndMessage"));
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetcher.post<{ data?: { ticket?: { id?: string; ticket_number?: string } } }>(
        "/api/provider/support-tickets",
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          category,
          support_context_type: bookingPrefill.supportContextType ?? undefined,
          support_context_id: bookingPrefill.supportContextId,
          support_context_label: bookingPrefill.supportContextLabel || null,
        },
      );
      const id = res.data?.ticket?.id;
      const num = res.data?.ticket?.ticket_number;
      toast.success(num ? t("web.provider.pages.support-tickets/new.ticketSubmittedNumber", { number: num }) : t("web.provider.pages.support-tickets/new.ticketSubmitted"));
      router.push(id ? `/provider/support-tickets/${id}` : "/provider/support-tickets");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.support-tickets/new.failedToSubmit"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("web.provider.pages.support-tickets/new.title")}
        subtitle={t("web.provider.pages.support-tickets/new.subtitle")}
        breadcrumbs={[
          { label: t("web.provider.common.more"), href: "/provider/more" },
          { label: t("web.provider.pages.support-tickets/new.supportTickets"), href: "/provider/support-tickets" },
          { label: t("web.provider.pages.support-tickets/new.newTicket") },
        ]}
      />

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 max-w-xl space-y-4">
        {bookingPrefill.supportContextLabel ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {t("web.provider.pages.support-tickets/new.relatedBooking")} <span className="font-medium">{bookingPrefill.supportContextLabel}</span>
          </div>
        ) : null}
        <div>
          <Label htmlFor="category">{t("web.provider.pages.support-tickets/new.category")}</Label>
          <select
            id="category"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="priority">{t("web.provider.pages.support-tickets/new.priority")}</Label>
          <select
            id="priority"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            <option value="low">{t("web.provider.pages.support-tickets/new.priorityLow")}</option>
            <option value="medium">{t("web.provider.pages.support-tickets/new.priorityMedium")}</option>
            <option value="high">{t("web.provider.pages.support-tickets/new.priorityHigh")}</option>
            <option value="urgent">{t("web.provider.pages.support-tickets/new.priorityUrgent")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="subject">{t("web.provider.pages.support-tickets/new.subject")}</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="message">{t("web.provider.pages.support-tickets/new.message")}</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={5000}
          />
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? t("web.provider.pages.support-tickets/new.submitting") : t("web.provider.pages.support-tickets/new.submitTicket")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/provider/support-tickets">{t("web.provider.common.cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
