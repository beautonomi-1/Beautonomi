"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import BackButton from "@/components/ui/back-button";
import Breadcrumb from "../../components/breadcrumb";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { formatBookingDateInTimeZone, formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GroupParticipant = {
  id: string;
  booking_id: string | null;
  name: string;
  service_name: string;
  price: number;
  is_primary_contact: boolean;
  is_current_user: boolean;
  payment_status: string | null;
  booking_number: string | null;
};

type GroupBookingDetail = {
  id: string;
  ref_number: string;
  title: string;
  status: string;
  scheduled_at: string;
  provider?: { business_name?: string | null; phone?: string | null; email?: string | null } | null;
  participants: GroupParticipant[];
  total_price: number;
  currency: string;
  balance_due?: number;
  amount_paid?: number;
  is_primary_payer?: boolean;
  package_name?: string | null;
};

export default function GroupBookingDetailPageClient() {
  const { t } = useTranslation();
  const gbd = (key: string, opts?: Record<string, string | number>) =>
    t(`customer.mobile.screens.groupBookingDetail.${key}`, opts) as string;
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;
  const [detail, setDetail] = useState<GroupBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher.get<{ data: GroupBookingDetail }>(
        `/api/me/group-bookings/${encodeURIComponent(groupId)}`,
        { cache: "no-store", staleTimeMs: 0 },
      );
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : gbd("loadFailed"));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReschedule = async () => {
    if (!groupId || !rescheduleDate || !rescheduleTime) return;
    const parsed = Date.parse(`${rescheduleDate}T${rescheduleTime}:00`);
    if (!Number.isFinite(parsed)) {
      toast.error(gbd("invalidDateTimeBody"));
      return;
    }
    setRescheduling(true);
    try {
      await fetcher.post(`/api/me/group-bookings/${encodeURIComponent(groupId)}/reschedule`, {
        new_datetime: new Date(parsed).toISOString(),
      });
      toast.success(t("booking.rescheduled") as string);
      setRescheduleOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : gbd("couldNotReschedule"));
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.accountSettings.bookings.loading")} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title={t("web.accountSettings.bookings.notFoundTitle")}
          description={error || t("web.accountSettings.bookings.notFoundDescription")}
          action={{
            label: t("web.accountSettings.bookings.backToBookings"),
            onClick: () => router.push("/account-settings/bookings"),
          }}
        />
      </div>
    );
  }

  const currency = detail.currency || "ZAR";
  const fmt = (n: number) => formatCurrency(n, currency);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8">
      <BackButton href="/account-settings/bookings" label={t("web.accountSettings.bookings.backToBookings")} />
      <Breadcrumb
        items={[
          { label: t("web.accountSettings.bookings.breadcrumbAccount"), href: "/account-settings" },
          { label: t("web.accountSettings.bookings.breadcrumbBookings"), href: "/account-settings/bookings" },
          {
            label: t("web.accountSettings.bookings.list.groupSession", { ref: detail.ref_number }),
          },
        ]}
      />

      <div className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">{detail.title}</h1>
          <p className="text-sm text-violet-700 font-medium mt-1">
            {t("web.accountSettings.bookings.list.groupSession", { ref: detail.ref_number })}
          </p>
          <p className="text-gray-600 mt-2">
            {formatBookingDateInTimeZone(detail.scheduled_at)} ·{" "}
            {formatBookingTimeInTimeZone(detail.scheduled_at)}
          </p>
          {detail.provider?.business_name ? (
            <p className="text-gray-800 font-medium mt-1">{detail.provider.business_name}</p>
          ) : null}
        </div>

        {detail.is_primary_payer ? (
          <Button type="button" variant="outline" onClick={() => setRescheduleOpen(true)}>
            {gbd("rescheduleSession")}
          </Button>
        ) : null}

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">{gbd("participants")}</h2>
          <ul className="space-y-3">
            {detail.participants.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-3 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">
                    {p.name}
                    {p.is_current_user ? (
                      <span className="ml-2 text-xs text-gray-500">({gbd("youBadge")})</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-gray-600">{p.service_name}</p>
                  {p.booking_number && p.booking_id ? (
                    <Link
                      href={`/account-settings/bookings/${p.booking_id}`}
                      className="text-xs text-[#FF0077] hover:underline"
                    >
                      {t("web.accountSettings.bookings.bookingNumber", { number: p.booking_number })}
                    </Link>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{fmt(p.price)}</p>
                  {p.payment_status ? <p className="text-gray-500 capitalize">{p.payment_status.replace(/_/g, " ")}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex justify-between text-sm">
            <span>{gbd("total")}</span>
            <span className="font-semibold">{fmt(detail.total_price)}</span>
          </div>
          {typeof detail.amount_paid === "number" ? (
            <div className="flex justify-between text-sm mt-2">
              <span>{gbd("payment")}</span>
              <span>{gbd("paidOfTotal", { paid: fmt(detail.amount_paid), total: fmt(detail.total_price) })}</span>
            </div>
          ) : null}
          {typeof detail.balance_due === "number" && detail.balance_due > 0 ? (
            <div className="flex justify-between text-sm mt-2 text-amber-800">
              <span>{gbd("balanceDue", { amount: fmt(detail.balance_due) })}</span>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gbd("rescheduleModalTitle")}</DialogTitle>
            <DialogDescription>{gbd("rescheduleModalBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="group-reschedule-date">{gbd("dateLabel")}</Label>
              <Input
                id="group-reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="group-reschedule-time">{gbd("timeLabel")}</Label>
              <Input
                id="group-reschedule-time"
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>
              {gbd("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleReschedule()} disabled={rescheduling}>
              {rescheduling ? gbd("saving") : gbd("saveNewTime")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
