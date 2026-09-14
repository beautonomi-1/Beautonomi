"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { RecurringAppointment, RecurrencePattern, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, Repeat, Edit, Trash2, MoreVertical } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/provider-portal/Money";
import { toast } from "sonner";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useRouter } from "next/navigation";
import { FetchError } from "@/lib/http/fetcher";
import {
  formatApiErrorMessage,
  subscriptionUpgradeHint,
} from "@/lib/http/api-error";
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";

export default function RecurringAppointmentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { selectedLocationId } = useProviderPortal();
  const [appointments, setAppointments] = useState<RecurringAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadBlocked, setLoadBlocked] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<RecurringAppointment | null>(null);
  const [editMode, setEditMode] = useState<"single" | "series">("single");

  const loadAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadBlocked(null);
      const filters: FilterParams = {
        search: searchQuery || undefined,
        location_id: selectedLocationId || undefined,
      };

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listRecurringAppointments(filters, pagination);
      setAppointments(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load recurring appointments:", error);
      const message =
        formatApiErrorMessage(error, t("web.provider.recurringAppointments.failedToLoad")) +
        subscriptionUpgradeHint(error);
      setLoadBlocked({
        message,
        code: error instanceof FetchError ? error.code : undefined,
      });
      setAppointments([]);
      setTotalPages(1);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, selectedLocationId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleSearch = () => {
    setPage(1);
    loadAppointments();
  };

  const handleEdit = (appointment: RecurringAppointment, mode: "single" | "series") => {
    setSelectedAppointment(appointment);
    setEditMode(mode);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (appointment: RecurringAppointment) => {
    if (
      !confirm(
        t("web.provider.recurringAppointments.deleteConfirm")
      )
    ) {
      return;
    }

    try {
      await providerApi.deleteRecurringAppointment(appointment.id, true);
      setAppointments((current) =>
        current.filter((item) => item.id !== appointment.id)
      );
      toast.success(t("web.provider.recurringAppointments.seriesDeleted"));
      void loadAppointments();
    } catch (error) {
      console.error("Failed to delete appointment:", error);
      toast.error(
        formatApiErrorMessage(error, t("web.provider.recurringAppointments.failedToDelete")) +
          subscriptionUpgradeHint(error)
      );
    }
  };

  const getPatternLabel = (pattern: string) => {
    switch (pattern) {
      case "daily":
        return t("web.provider.recurringAppointments.daily");
      case "weekly":
        return t("web.provider.recurringAppointments.weekly");
      case "biweekly":
        return t("web.provider.recurringAppointments.biweekly");
      case "monthly":
        return t("web.provider.recurringAppointments.monthly");
      default:
        return pattern;
    }
  };

  const getStatusColor = (status: RecurringAppointment["status"]) => {
    switch (status) {
      case "booked":
        return "bg-blue-100 text-blue-800";
      case "started":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
    }
  };

  // Group appointments by series
  const _groupedBySeries = appointments.reduce((acc, apt) => {
    if (!acc[apt.series_id]) {
      acc[apt.series_id] = [];
    }
    acc[apt.series_id].push(apt);
    return acc;
  }, {} as Record<string, RecurringAppointment[]>);

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.recurringAppointments.loading")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.recurringAppointments.title")}
        subtitle={t("web.provider.recurringAppointments.subtitle")}
      />

      {loadBlocked && (
        <div
          className="mb-6 rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-light leading-relaxed">{loadBlocked.message}</p>
          {loadBlocked.code && isPlanGateErrorCode(loadBlocked.code) && (
            <Button
              type="button"
              className="mt-3 bg-primary hover:bg-primary-hover text-white"
              onClick={() => router.push("/provider/subscription")}
            >
              {t("web.provider.settings.pages.calendar-integration.viewPlans")}
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={t("web.provider.recurringAppointments.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            className="ps-10"
          />
        </div>
        <Button onClick={handleSearch} className="bg-primary hover:bg-primary-hover">
          {t("web.provider.common.search")}
        </Button>
      </div>

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.recurringAppointments.emptyTitle")}
            description={t("web.provider.recurringAppointments.emptyBody")}
            action={{
              label: t("web.provider.recurringAppointments.openCalendar"),
              onClick: () => router.push("/provider/calendar"),
            }}
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("web.provider.recurringAppointments.client")}</TableHead>
                    <TableHead>{t("web.provider.common.service")}</TableHead>
                    <TableHead>{t("web.provider.settings.pages.calendar/display-preferences.teamMember")}</TableHead>
                    <TableHead>{t("web.provider.recurringAppointments.schedule")}</TableHead>
                    <TableHead>{t("web.provider.recurringAppointments.pattern")}</TableHead>
                    <TableHead>{t("web.provider.recurringAppointments.nextDate")}</TableHead>
                    <TableHead>{t("web.provider.settings.pages.addons.price")}</TableHead>
                    <TableHead>{t("web.provider.settings.pages.addons.status")}</TableHead>
                    <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((apt) => (
                    <TableRow key={apt.id}>
                      <TableCell className="font-medium">{apt.client_name}</TableCell>
                      <TableCell>{apt.service_name}</TableCell>
                      <TableCell>{apt.team_member_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="w-3 h-3" />
                          <span>{apt.scheduled_date}</span>
                          <span className="text-gray-400">@</span>
                          <span>{apt.scheduled_time}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Repeat className="w-3 h-3 text-gray-400" />
                          <span>{getPatternLabel(apt.recurrence_rule.pattern)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {apt.next_occurrence_date ? (
                          <span className="whitespace-nowrap">
                            {new Date(`${apt.next_occurrence_date}T12:00:00`).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-400">{t("web.provider.common.emDash")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Money amount={apt.price} />
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(apt.status)}>
                          {apt.status}
                        </Badge>
                        {apt.is_exception && (
                          <Badge variant="outline" className="ms-2">
                            {t("web.provider.recurringAppointments.modified")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(apt, "series")}>
                              <Edit className="w-4 h-4 me-2" />
                              {t("web.provider.recurringAppointments.editSeries")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(apt)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 me-2" />
                              {t("web.provider.recurringAppointments.deleteSeries")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Edit Dialog */}
      {selectedAppointment && (
        <RecurringAppointmentEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          appointment={selectedAppointment}
          editMode={editMode}
          onSuccess={(savedAppointment) => {
            setAppointments((current) =>
              current.map((item) =>
                item.id === savedAppointment.id
                  ? {
                      ...item,
                      ...savedAppointment,
                      client_name: savedAppointment.client_name || item.client_name,
                      service_name: savedAppointment.service_name || item.service_name,
                      team_member_name: savedAppointment.team_member_name || item.team_member_name,
                    }
                  : item
              )
            );
            void loadAppointments();
          }}
        />
      )}
    </div>
  );
}

// Edit Recurring Appointment Dialog
function RecurringAppointmentEditDialog({
  open,
  onOpenChange,
  appointment,
  editMode,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: RecurringAppointment;
  editMode: "single" | "series";
  onSuccess: (savedAppointment: RecurringAppointment) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const initialForm = useMemo(() => {
    const meta = (appointment.metadata || {}) as Record<string, unknown>;
    const dm =
      typeof meta.duration_minutes === "number" && Number.isFinite(meta.duration_minutes)
        ? meta.duration_minutes
        : appointment.duration_minutes;
    const pr =
      typeof meta.price === "number" && Number.isFinite(meta.price)
        ? meta.price
        : appointment.price;
    return {
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      duration_minutes: dm,
      price: pr,
      notes: appointment.notes || "",
      recurrence_pattern: appointment.recurrence_rule.pattern,
      recurrence_end_date: appointment.end_date || appointment.recurrence_rule.end_date || "",
      recurrence_occurrences: appointment.recurrence_rule.occurrences || undefined,
    };
  }, [appointment]);

  const [formData, setFormData] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [editSubscriptionRequired, setEditSubscriptionRequired] = useState(false);

  useEffect(() => {
    if (open) setFormData(initialForm);
  }, [open, initialForm]);

  useEffect(() => {
    if (open) setEditSubscriptionRequired(false);
  }, [open]);

  const mergedMetadata = useCallback(() => {
    const base =
      appointment.metadata && typeof appointment.metadata === "object"
        ? { ...appointment.metadata }
        : {};
    return {
      ...base,
      duration_minutes: formData.duration_minutes,
      price: formData.price,
    };
  }, [appointment.metadata, formData.duration_minutes, formData.price]);

  const simpleFrequencyFromPattern = (
    p: RecurrencePattern
  ): "weekly" | "biweekly" | "monthly" | null => {
    if (p === "weekly") return "weekly";
    if (p === "biweekly") return "biweekly";
    if (p === "monthly") return "monthly";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const metadata = mergedMetadata();
      let savedAppointment: RecurringAppointment;
      if (editMode === "series") {
        const freq = simpleFrequencyFromPattern(formData.recurrence_pattern as RecurrencePattern);
        savedAppointment = await providerApi.updateRecurringSeries(appointment.series_id, {
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time,
          client_name: appointment.client_name,
          service_name: appointment.service_name,
          team_member_name: appointment.team_member_name,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          notes: formData.notes,
          metadata,
          frequency: freq,
          end_date: formData.recurrence_end_date || undefined,
          recurrence_rule: {
            pattern: formData.recurrence_pattern as RecurrencePattern,
            interval: formData.recurrence_pattern === "biweekly" ? 2 : 1,
            end_date: formData.recurrence_end_date || undefined,
            occurrences: formData.recurrence_occurrences,
          },
        });
        toast.success(t("web.provider.recurringAppointments.seriesUpdated"));
      } else {
        savedAppointment = await providerApi.updateRecurringAppointment(appointment.id, {
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time,
          client_name: appointment.client_name,
          service_name: appointment.service_name,
          team_member_name: appointment.team_member_name,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          notes: formData.notes,
          metadata,
        });
        toast.success(t("web.provider.recurringAppointments.appointmentUpdated"));
      }
      onSuccess(savedAppointment);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update appointment:", error);
      toastPlanGateError(error, t("web.provider.recurringAppointments.failedToUpdate"));
      if (error instanceof FetchError && isPlanGateErrorCode(error.code)) {
        setEditSubscriptionRequired(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("web.provider.recurringAppointments.editTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            {t("web.provider.recurringAppointments.editHint")}
          </div>

          {editSubscriptionRequired && (
            <div
              className="rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-light leading-relaxed">
                {getUpgradeMessage("recurring.feature")}
              </p>
              <Button
                type="button"
                className="mt-2 bg-primary hover:bg-primary-hover text-white"
                onClick={() => router.push("/provider/subscription")}
              >
                {t("web.provider.recurringAppointments.viewPlansBilling")}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduled_date">{t("web.provider.common.date")}</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) =>
                  setFormData({ ...formData, scheduled_date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="scheduled_time">{t("web.provider.common.time")}</Label>
              <Input
                id="scheduled_time"
                type="time"
                value={formData.scheduled_time}
                onChange={(e) =>
                  setFormData({ ...formData, scheduled_time: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration_minutes">{t("web.provider.recurringAppointments.durationMinutes")}</Label>
              <Input
                id="duration_minutes"
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: parseInt(e.target.value) || 60,
                  })
                }
                min={15}
                step={15}
              />
            </div>
            <div>
              <Label htmlFor="price">{t("web.provider.recurringAppointments.priceR")}</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: parseFloat(e.target.value) || 0,
                  })
                }
                min={0}
                step={0.01}
              />
            </div>
          </div>

          {editMode === "series" && (
            <>
              <div>
                <Label htmlFor="recurrence_pattern">{t("web.provider.recurringAppointments.recurrencePattern")}</Label>
                <Select
                  value={formData.recurrence_pattern}
                  onValueChange={(value) =>
                    setFormData({ ...formData, recurrence_pattern: value as RecurrencePattern })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("web.provider.recurringAppointments.daily")}</SelectItem>
                    <SelectItem value="weekly">{t("web.provider.recurringAppointments.weekly")}</SelectItem>
                    <SelectItem value="biweekly">{t("web.provider.recurringAppointments.biweekly")}</SelectItem>
                    <SelectItem value="monthly">{t("web.provider.recurringAppointments.monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recurrence_end_date">{t("web.provider.recurringAppointments.endDateOptional")}</Label>
                  <Input
                    id="recurrence_end_date"
                    type="date"
                    value={formData.recurrence_end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, recurrence_end_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="recurrence_occurrences">{t("web.provider.recurringAppointments.numberOfOccurrences")}</Label>
                  <Input
                    id="recurrence_occurrences"
                    type="number"
                    min={1}
                    value={formData.recurrence_occurrences || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        recurrence_occurrences: parseInt(e.target.value) || undefined,
                      })
                    }
                    placeholder={t("web.provider.recurringAppointments.leaveEmpty")}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="notes">{t("web.provider.recurringAppointments.notes")}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? t("web.provider.common.saving") : t("web.provider.common.update")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
