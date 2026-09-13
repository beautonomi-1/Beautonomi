"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useMemo, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

type AvailabilityBlock = {
  id: string;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string;
  end_at: string;
  reason?: string | null;
};

export default function ClosedPeriodsSettings() {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 60);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetcher.get<{ data: AvailabilityBlock[] }>(
        `/api/provider/availability-blocks?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      );
      setBlocks((res.data || []).filter((b) => b.block_type === "unavailable"));
    } catch (error: any) {
      console.error("Error loading closed periods:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.appointment-activity/closed-periods.loadFailed");
      setError(errorMessage);
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createClosedPeriod = async () => {
    try {
      setIsSaving(true);
      if (!startAt || !endAt) {
        toast.error(t("web.provider.settings.pages.appointment-activity/closed-periods.startAndEndDateTimeAre"));
        return;
      }

      // Convert datetime-local format to ISO string
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        toast.error(t("web.provider.settings.pages.appointment-activity/closed-periods.invalidDateTimeFormat"));
        return;
      }

      if (endDate <= startDate) {
        toast.error(t("web.provider.settings.pages.appointment-activity/closed-periods.endTimeMustBeAfterStart"));
        return;
      }

      await fetcher.post("/api/provider/availability-blocks", {
        block_type: "unavailable",
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        reason: reason.trim() || t("web.provider.settings.pages.appointment-activity/closed-periods.defaultReason"),
      });
      setStartAt("");
      setEndAt("");
      setReason("");
      toast.success(t("web.provider.settings.pages.appointment-activity/closed-periods.closedPeriodAddedSuccessfully"));
      await load();
    } catch (e: any) {
      const errorMessage = e instanceof FetchError
        ? e.message
        : e?.error?.message || t("web.provider.settings.pages.appointment-activity/closed-periods.addFailed");
      toast.error(errorMessage);
      console.error("Error creating closed period:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBlock = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.appointment-activity/closed-periods.removeConfirm"))) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/availability-blocks/${id}`);
      toast.success(t("web.provider.settings.pages.appointment-activity/closed-periods.closedPeriodRemovedSuccessfully"));
      await load();
    } catch (e: any) {
      const errorMessage = e instanceof FetchError
        ? e.message
        : e?.error?.message || t("web.provider.settings.pages.appointment-activity/closed-periods.removeFailed");
      toast.error(errorMessage);
      console.error("Error deleting closed period:", e);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.appointment-activity/closed-periods.businessClosedPeriods") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.closedPeriods.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.closedPeriods.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.appointment-activity/closed-periods.loadingClosedPeriods")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.appointmentActivity.items.closedPeriods.title")}
      subtitle={t("web.provider.settings.categories.appointmentActivity.items.closedPeriods.description")}
      onSave={createClosedPeriod}
      isSaving={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
<Label>{t("web.provider.settings.pages.appointment-activity/closed-periods.start")}</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div className="space-y-2">
<Label>{t("web.provider.settings.pages.appointment-activity/closed-periods.end")}</Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
<Label>{t("web.provider.pages.team/days-off.reasonOptional")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("web.provider.settings.pages.appointment-activity/closed-periods.holidayMaintenanceClosed")} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={createClosedPeriod} disabled={isSaving}>
{t("web.provider.settings.pages.appointment-activity/closed-periods.addClosedPeriod")}
            </Button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <SectionCard>
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            {error}
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="space-y-3">
<div className="text-sm text-gray-600">{t("web.provider.settings.pages.appointment-activity/closed-periods.upcomingTitle")}</div>
          {blocks.length === 0 ? (
            <EmptyState
              title={t("web.provider.settings.pages.appointment-activity/closed-periods.noClosedPeriods")}
description={t("web.provider.settings.pages.appointment-activity/closed-periods.emptyHint")}
            />
          ) : (
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded border p-3 hover:bg-gray-50 transition-colors">
                  <div className="space-y-1 flex-1">
                    <div className="text-sm font-medium">
                      {new Date(b.start_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} → {new Date(b.end_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    {b.reason && (
                      <div className="text-sm text-gray-600">{b.reason}</div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteBlock(b.id)}
                  >
{t("web.provider.settings.pages.appointment-activity/closed-periods.remove")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
