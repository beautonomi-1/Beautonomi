"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X, Users, Calendar as CalendarIcon2 } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DayOff {
  id: string;
  team_member_id: string;
  team_member_name: string;
  date: string;
  reason?: string;
  is_approved?: boolean;
  time_off_id?: string | null;
  time_off_status?: string | null;
}

export default function DaysOffPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  /** Keeps the calendar view in sync when picking a date or opening the dialog. */
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const { t } = useTranslation();

  const todayStart = startOfDay(new Date());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members.filter((m) => m.is_active));
      
      // Load days off from API for all members
      const { fetcher } = await import("@/lib/http/fetcher");
      const allDaysOff: any[] = [];
      for (const member of members) {
        try {
          const response = await fetcher.get<{ data: any[] }>(`/api/provider/staff/${member.id}/days-off`);
          const memberDaysOff = (response.data || []).map((dayOff: any) => ({
            ...dayOff,
            team_member_id: dayOff.staff_id || member.id,
            team_member_name: member.name,
          }));
          allDaysOff.push(...memberDaysOff);
        } catch (error) {
          console.error(`Failed to load days off for ${member.name}:`, error);
        }
      }
      setDaysOff(allDaysOff);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error(t("web.provider.pages.team/days-off.failedToLoadData"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDayOff = () => {
    setSelectedMembers([]);
    setSelectedDate(undefined);
    setCalendarMonth(new Date());
    setReason("");
    setIsDialogOpen(true);
  };

  const handleSaveDayOff = async () => {
    if (!selectedDate || selectedMembers.length === 0) {
      toast.error(t("web.provider.pages.team/days-off.selectMemberAndDate"));
      return;
    }

    try {
      setIsSaving(true);
      const { fetcher } = await import("@/lib/http/fetcher");
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const trimmedReason = reason.trim();
      const body: { date: string; reason?: string } = { date: dateStr };
      if (trimmedReason) body.reason = trimmedReason;

      const results = await Promise.allSettled(
        selectedMembers.map((memberId) =>
          fetcher.post<{
            data?: { overlapping_bookings?: Array<{ booking_number?: string | null }> };
          }>(`/api/provider/staff/${memberId}/days-off`, body)
        )
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      const overlapCount = results.reduce((sum, r) => {
        if (r.status !== "fulfilled") return sum;
        return sum + (r.value.data?.overlapping_bookings?.length ?? 0);
      }, 0);

      if (ok === selectedMembers.length) {
        toast.success(t("web.provider.pages.team/days-off.dayOffSetFor", { count: ok }));
        if (overlapCount > 0) {
          toast.warning(t("web.provider.pages.team/days-off.overlappingBookings", { count: overlapCount }));
        }
        setIsDialogOpen(false);
        loadData();
        return;
      }

      if (ok > 0) {
        toast.warning(
          t("web.provider.pages.team/days-off.savedPartial", { ok, total: selectedMembers.length, failed: failed.length })
        );
        loadData();
        return;
      }

      const firstErr = failed[0]?.reason;
      const msg =
        firstErr instanceof FetchError
          ? firstErr.message
          : firstErr instanceof Error
            ? firstErr.message
            : t("web.provider.pages.team/days-off.failedToSaveDayOff");
      toast.error(msg);
    } catch (error: unknown) {
      console.error("Failed to save day off:", error);
      toast.error(error instanceof Error ? error.message : t("web.provider.pages.team/days-off.failedToSaveDayOff"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDayOff = async (dayOff: DayOff) => {
    if (!confirm(t("web.provider.pages.team/days-off.confirmRemoveDayOff"))) return;

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/staff/${dayOff.team_member_id}/days-off/${dayOff.id}`);
      toast.success(t("web.provider.pages.team/days-off.dayOffRemoved"));
      loadData();
    } catch (error: any) {
      console.error("Failed to remove day off:", error);
      toast.error(error?.message || t("web.provider.pages.team/days-off.failedToRemoveDayOff"));
    }
  };

  const handleReviewTimeOff = async (dayOff: DayOff, status: "approved" | "denied") => {
    if (!dayOff.time_off_id) {
      toast.error(t("web.provider.pages.team/days-off.requestNotReady"));
      return;
    }
    setReviewingId(dayOff.id);
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.patch(`/api/provider/staff/${dayOff.team_member_id}/time-off/${dayOff.time_off_id}`, {
        status,
      });
      toast.success(status === "approved" ? t("web.provider.pages.team/days-off.timeOffApproved") : t("web.provider.pages.team/days-off.timeOffDenied"));
      loadData();
    } catch (error: unknown) {
      toast.error(error instanceof FetchError ? error.message : t("web.provider.pages.team/days-off.failedToUpdateTimeOff"));
    } finally {
      setReviewingId(null);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMembers.length === teamMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(teamMembers.map((m) => m.id));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("web.provider.sidebar.items.daysOff")}
        subtitle={t("web.provider.pages.team/days-off.subtitle")}
        primaryAction={{
          label: t("web.provider.pages.team/days-off.setDayOff"),
          onClick: handleAddDayOff,
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
      />

      <div className="mt-4 mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <p className="text-sm text-emerald-800">
          <strong>{t("web.provider.pages.team/days-off.howDaysOffWork")}</strong> {t("web.provider.pages.team/days-off.howDaysOffBody")} <a href="/provider/time-blocks" className="underline font-medium">{t("web.provider.pages.team/days-off.timeBlocks")}</a> {t("web.provider.pages.team/days-off.instead")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <CalendarIcon2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/days-off.totalDaysOff")}</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {daysOff.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.common.statsRange.thisMonth")}</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {daysOff.filter((d) => {
                  const date = new Date(d.date);
                  const now = new Date();
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                }).length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CalendarIcon2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/days-off.upcoming")}</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {daysOff.filter((d) => new Date(d.date) >= new Date()).length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Days Off List */}
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : daysOff.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <CalendarIcon2 className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{t("web.provider.pages.team/days-off.noDaysOffScheduled")}</p>
          <Button onClick={handleAddDayOff} className="min-h-[44px] touch-manipulation">
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.pages.team/days-off.setDayOff")}
          </Button>
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-start text-xs sm:text-sm font-medium text-gray-700">{t("web.provider.pages.team/days-off.teamMember")}</th>
                  <th className="px-4 py-3 text-start text-xs sm:text-sm font-medium text-gray-700">{t("web.provider.pages.team/days-off.date")}</th>
                  <th className="px-4 py-3 text-start text-xs sm:text-sm font-medium text-gray-700">{t("web.provider.pages.team/days-off.reason")}</th>
                  <th className="px-4 py-3 text-start text-xs sm:text-sm font-medium text-gray-700">{t("web.provider.common.statusLabel")}</th>
                  <th className="px-4 py-3 text-end text-xs sm:text-sm font-medium text-gray-700">{t("web.provider.pages.team/days-off.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {daysOff.map((dayOff) => {
                  const member = teamMembers.find((m) => m.id === dayOff.team_member_id);
                  const isPast = new Date(dayOff.date) < new Date();
                  return (
                    <tr key={dayOff.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Avatar className="w-8 h-8 sm:w-10 sm:h-10">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                              {member?.name.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm sm:text-base font-medium">{dayOff.team_member_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base">
                            {format(new Date(dayOff.date), "MMM d, yyyy")}
                          </span>
                          {isPast ? (
                            <Badge variant="outline" className="text-xs">{t("web.provider.pages.team/days-off.past")}</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 text-xs">{t("web.provider.pages.team/days-off.upcoming")}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{dayOff.reason || "-"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {dayOff.time_off_status === "pending" || dayOff.is_approved === false ? (
                          <Badge className="bg-amber-100 text-amber-800 text-xs">{t("web.provider.common.status.pending")}</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 text-xs">{t("web.provider.pages.team/days-off.approved")}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex justify-end gap-2">
                          {(dayOff.time_off_status === "pending" || dayOff.is_approved === false) &&
                          dayOff.time_off_id ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={reviewingId === dayOff.id}
                                onClick={() => void handleReviewTimeOff(dayOff, "approved")}
                              >
                                {t("web.provider.pages.team/payroll/[id].approve")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={reviewingId === dayOff.id}
                                onClick={() => void handleReviewTimeOff(dayOff, "denied")}
                              >
                                {t("web.provider.pages.team/days-off.deny")}
                              </Button>
                            </>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveDayOff(dayOff)}
                            className="min-h-[36px] touch-manipulation"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Add Day Off Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {t("web.provider.pages.team/days-off.setDayOff")}
            </DialogTitle>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {t("web.provider.pages.team/days-off.setDayOffHint")}
            </p>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Team Member Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm sm:text-base font-medium">{t("web.provider.pages.team/days-off.selectTeamMembers")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs min-h-[32px] touch-manipulation"
                >
                  {selectedMembers.length === teamMembers.length ? t("web.provider.bookings.bulkActions.deselectAll") : t("web.provider.bookings.bulkActions.selectAll")}
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                    onClick={() => toggleMemberSelection(member.id)}
                  >
                    <span
                      className="inline-flex shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={() => toggleMemberSelection(member.id)}
                      />
                    </span>
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {member.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium flex-1">{member.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Date — inline calendar avoids popover z-index / focus issues inside Dialog */}
            <div>
              <Label className="text-sm sm:text-base font-medium mb-2 block">{t("web.provider.pages.team/days-off.dateRequired")}</Label>
              <p className="text-xs text-muted-foreground mb-3">
                {t("web.provider.pages.team/days-off.datePickerHint")}{" "}
                <a href="/provider/time-blocks" className="underline font-medium text-foreground">
                  {t("web.provider.pages.team/days-off.timeBlocksLower")}
                </a>{" "}
                {t("web.provider.pages.team/days-off.forPartialDays")}
              </p>
              <div
                className={cn(
                  "rounded-xl border bg-card p-2 sm:p-3 shadow-sm",
                  "flex flex-col items-center sm:items-stretch"
                )}
              >
                <div className="mb-2 w-full text-center sm:text-start">
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      !selectedDate && "text-muted-foreground"
                    )}
                    aria-live="polite"
                  >
                    {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : t("web.provider.pages.team/days-off.chooseADateBelow")}
                  </span>
                </div>
                <Calendar
                  mode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    if (d) setCalendarMonth(d);
                  }}
                  disabled={(d) => d < todayStart}
                  initialFocus
                  className="mx-auto"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason" className="text-sm sm:text-base font-medium">
                {t("web.provider.pages.team/days-off.reasonOptional")}
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[{ value: "Vacation", key: "vacation" }, { value: "Sick leave", key: "sickLeave" }, { value: "Personal", key: "personal" }, { value: "Public holiday", key: "publicHoliday" }].map(({ value: preset, key }) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={reason.trim() === preset ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-full text-xs touch-manipulation"
                    onClick={() => setReason(preset)}
                  >
                    {t(`web.provider.pages.team/days-off.${key}`)}
                  </Button>
                ))}
              </div>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("web.provider.pages.team/days-off.orTypeYourOwn")}
                className="mt-2 min-h-[44px] touch-manipulation"
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveDayOff}
              disabled={
                isSaving || !selectedDate || selectedMembers.length === 0 || teamMembers.length === 0
              }
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
            >
              {isSaving ? t("web.provider.pages.team/days-off.savingEllipsis") : t("web.provider.pages.team/days-off.setDayOff")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
