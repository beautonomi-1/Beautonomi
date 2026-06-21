"use client";

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

export default function RecurringAppointmentsPage() {
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
        formatApiErrorMessage(error, "Failed to load recurring appointments") +
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
        "Delete this recurring series? Future auto-created visits will stop; existing bookings already on the calendar stay as they are."
      )
    ) {
      return;
    }

    try {
      await providerApi.deleteRecurringAppointment(appointment.id, true);
      setAppointments((current) =>
        current.filter((item) => item.id !== appointment.id)
      );
      toast.success("Series deleted");
      void loadAppointments();
    } catch (error) {
      console.error("Failed to delete appointment:", error);
      toast.error(
        formatApiErrorMessage(error, "Failed to delete appointment") +
          subscriptionUpgradeHint(error)
      );
    }
  };

  const getPatternLabel = (pattern: string) => {
    switch (pattern) {
      case "daily":
        return "Daily";
      case "weekly":
        return "Weekly";
      case "biweekly":
        return "Bi-weekly";
      case "monthly":
        return "Monthly";
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
    return <LoadingTimeout loadingMessage="Loading recurring appointments..." />;
  }

  return (
    <div>
      <PageHeader
        title="Recurring Appointments"
        subtitle="Manage your repeating appointments and series"
      />

      {loadBlocked && (
        <div
          className="mb-6 rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-light leading-relaxed">{loadBlocked.message}</p>
          {loadBlocked.code === "SUBSCRIPTION_REQUIRED" && (
            <Button
              type="button"
              className="mt-3 bg-primary hover:bg-primary-hover text-white"
              onClick={() => router.push("/provider/subscription")}
            >
              View plans & billing
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by client or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} className="bg-primary hover:bg-primary-hover">
          Search
        </Button>
      </div>

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No recurring appointments"
            description="From the calendar, open a new appointment, pick a saved client, turn on Repeating visit, then book."
            action={{
              label: "Open calendar",
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
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Team Member</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Next Date</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                          <span className="text-gray-400">—</span>
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
                          <Badge variant="outline" className="ml-2">
                            Modified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(apt, "series")}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Series
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(apt)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Series
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
        toast.success("Series updated");
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
        toast.success("Appointment updated");
      }
      onSuccess(savedAppointment);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update appointment:", error);
      const msg =
        formatApiErrorMessage(error, "Failed to update appointment") +
        subscriptionUpgradeHint(error);
      toast.error(msg);
      if (error instanceof FetchError && error.code === "SUBSCRIPTION_REQUIRED") {
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
            Edit Recurring Series
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            Changes update the recurring series. To change one generated visit, open that booking from the calendar.
          </div>

          {editSubscriptionRequired && (
            <div
              className="rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-light leading-relaxed">
                Your plan does not include editing recurring series. Upgrade to continue.
              </p>
              <Button
                type="button"
                className="mt-2 bg-primary hover:bg-primary-hover text-white"
                onClick={() => router.push("/provider/subscription")}
              >
                View plans & billing
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduled_date">Date</Label>
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
              <Label htmlFor="scheduled_time">Time</Label>
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
              <Label htmlFor="duration_minutes">Duration (minutes)</Label>
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
              <Label htmlFor="price">Price (R)</Label>
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
                <Label htmlFor="recurrence_pattern">Recurrence Pattern</Label>
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
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recurrence_end_date">End Date (Optional)</Label>
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
                  <Label htmlFor="recurrence_occurrences">Number of Occurrences</Label>
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
                    placeholder="Leave empty for no limit"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
