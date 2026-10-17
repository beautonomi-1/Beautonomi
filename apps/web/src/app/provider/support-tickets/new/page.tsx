"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  contextTypeForCategory,
  isSelectableForAudience,
  supportTicketPresetFromCategory,
} from "@/lib/support/ticket-categories";
import { SupportTicketCategoryPicker } from "@/components/support/SupportTicketCategoryPicker";
import { resolveBookingSupportTicketPrefill, shouldSendSupportContextId } from "@beautonomi/utils";

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
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [priorityTouched, setPriorityTouched] = useState(false);

  const applyCategory = useCallback(
    (value: string) => {
      setCategory(value);
      const preset = supportTicketPresetFromCategory(value);
      if (preset.priority && !priorityTouched) setPriority(preset.priority);
      if (preset.subject && !subjectTouched) setSubject(preset.subject);
    },
    [priorityTouched, subjectTouched],
  );

  useEffect(() => {
    const fromUrl = bookingPrefill.category ?? searchParams.get("category");
    if (fromUrl && isSelectableForAudience(fromUrl, "provider")) {
      applyCategory(fromUrl);
    }
    if (bookingPrefill.supportContextType === "booking" && bookingPrefill.supportContextLabel) {
      setSubject((current) =>
        current.trim()
          ? current
          : t("web.provider.pages.support-tickets/new.helpWithBooking", {
              label: bookingPrefill.supportContextLabel.split(" (")[0],
            }),
      );
    }
  }, [bookingPrefill, searchParams, applyCategory, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim()) {
      toast.error(t("web.provider.pages.support-tickets/new.chooseCategory"));
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error(t("web.provider.pages.support-tickets/new.enterSubjectAndMessage"));
      return;
    }
    const hasRef = Boolean(bookingPrefill.supportContextId) || Boolean(bookingPrefill.supportContextLabel?.trim());
    const contextType =
      hasRef && bookingPrefill.supportContextType
        ? bookingPrefill.supportContextType
        : contextTypeForCategory(category) ?? bookingPrefill.supportContextType ?? undefined;

    try {
      setSubmitting(true);
      const res = await fetcher.post<{ data?: { ticket?: { id?: string; ticket_number?: string } } }>(
        "/api/provider/support-tickets",
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          category,
          support_context_type: contextType,
          support_context_id: contextType && shouldSendSupportContextId(contextType) ? bookingPrefill.supportContextId : null,
          support_context_label: bookingPrefill.supportContextLabel?.trim() || null,
        },
      );
      const id = res.data?.ticket?.id;
      const num = res.data?.ticket?.ticket_number;
      toast.success(
        num
          ? t("web.provider.pages.support-tickets/new.ticketSubmittedNumber", { number: num })
          : t("web.provider.pages.support-tickets/new.ticketSubmitted"),
      );
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
            {t("web.provider.pages.support-tickets/new.relatedBooking")}{" "}
            <span className="font-medium">{bookingPrefill.supportContextLabel}</span>
          </div>
        ) : null}
        <div>
          <Label htmlFor="category">{t("web.provider.pages.support-tickets/new.category")}</Label>
          <div className="mt-1">
            <SupportTicketCategoryPicker
              id="category"
              value={category}
              onChange={applyCategory}
              audience="provider"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="priority">{t("web.provider.pages.support-tickets/new.priority")}</Label>
          <select
            id="priority"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={priority}
            onChange={(e) => {
              setPriorityTouched(true);
              setPriority(e.target.value as typeof priority);
            }}
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
            onChange={(e) => {
              setSubjectTouched(true);
              setSubject(e.target.value);
            }}
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
          <Button type="submit" disabled={submitting || !category.trim() || !subject.trim() || !message.trim()}>
            {submitting
              ? t("web.provider.pages.support-tickets/new.submitting")
              : t("web.provider.pages.support-tickets/new.submitTicket")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/provider/support-tickets">{t("web.provider.common.cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
