"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/provider-portal/Money";
import { toast } from "sonner";

export default function RecurringAppointmentsPage() {
  const [appointments, setAppointments] = useState<RecurringAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<RecurringAppointment | null>(null);
  const [editMode, setEditMode] = useState<"single" | "series">("single");

  const loadAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: searchQuery || undefined,
      };

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listRecurringAppointments(filters, pagination);
      setAppointments(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load recurring appointments:", error);
      toast.error("Failed to load recurring appointments");
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery]);

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

  const handleDelete = async (appointment: RecurringAppointment, deleteSeries: boolean) => {
    const message = deleteSeries
      ? "Are you sure you want to delete this entire recurring series?"
      : "Are you sure you want to delete this appointment instance?";
    
    if (!confirm(message)) return;

    try {
      await providerApi.deleteRecurringAppointment(appointment.id, deleteSeries);
      toast.success(deleteSeries ? "Series deleted" : "Appointment deleted");
      loadAppointments();
    } catch (error) {
      console.error("Failed to delete appointment:", error);
      toast.error("Failed to delete appointment");
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

      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by client or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} className="bg-[#FF0077] hover:bg-[#D60565]">
          Search
        </Button>
      </div>

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No recurring appointments"
            description="Create recurring appointments from the calendar or appointment dialog"
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
                        {new Date(apt.scheduled_date) >= new Date()
                          ? new Date(apt.scheduled_date).toLocaleDateString()
                          : "Past"}
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
                            <DropdownMenuItem onClick={() => handleEdit(apt, "single")}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit This Instance
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(apt, "series")}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Entire Series
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(apt, false)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete This Instance
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(apt, true)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Entire Series
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
          onSuccess={loadAppointments}
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
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    scheduled_date: appointment.scheduled_date,
    scheduled_time: appointment.scheduled_time,
    duration_minutes: appointment.duration_minutes,
    price: appointment.price,
    notes: appointment.notes || "",
    recurrence_pattern: appointment.recurrence_rule.pattern,
    recurrence_end_date: appointment.recurrence_rule.end_date || "",
    recurrence_occurrences: appointment.recurrence_rule.occurrences || undefined,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (editMode === "series") {
        await providerApi.updateRecurringSeries(appointment.series_id, {
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          notes: formData.notes,
          recurrence_rule: {
            pattern: formData.recurrence_pattern as any,
            interval: formData.recurrence_pattern === "biweekly" ? 2 : 1,
            end_date: formData.recurrence_end_date || undefined,
            occurrences: formData.recurrence_occurrences,
          },
        });
        toast.success("Series updated");
      } else {
        await providerApi.updateRecurringAppointment(appointment.id, {
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          notes: formData.notes,
        });
        toast.success("Appointment updated");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update appointment:", error);
      toast.error("Failed to update appointment");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editMode === "series" ? "Edit Recurring Series" : "Edit Appointment Instance"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            {editMode === "series"
              ? "Changes will apply to all future appointments in this series."
              : "This will create an exception for this specific appointment."}
          </div>

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
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
