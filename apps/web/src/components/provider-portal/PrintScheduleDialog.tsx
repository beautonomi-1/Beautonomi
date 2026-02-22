"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Appointment, TeamMember } from "@/lib/provider-portal/types";
import { format, startOfWeek, addDays } from "date-fns";
import { Printer, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrintScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointments: Appointment[];
  teamMembers: TeamMember[];
  selectedDate: Date;
  view: "day" | "week";
  initialStaffId?: string | null;
}

export function PrintScheduleDialog({
  open,
  onOpenChange,
  appointments,
  teamMembers,
  selectedDate,
  view,
  initialStaffId,
}: PrintScheduleDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");

  // Set initial staff ID when dialog opens
  React.useEffect(() => {
    if (open && initialStaffId) {
      setSelectedStaffId(initialStaffId);
    } else if (open && !initialStaffId) {
      setSelectedStaffId("all");
    }
  }, [open, initialStaffId]);
  const [options, setOptions] = useState({
    showClientPhone: true,
    showClientEmail: false,
    showServicePrice: true,
    showNotes: true,
    showCancelled: false,
    compactView: false,
  });

  // Get date range based on view
  const getDateRange = () => {
    if (view === "day") {
      return [selectedDate];
    }
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  };

  const dates = getDateRange();

  // Normalize date for comparison (API may return ISO string)
  const toDateStr = (d: string) => (d && d.length >= 10 ? d.slice(0, 10) : d || "");

  // Filter appointments
  const filteredAppointments = appointments.filter((apt) => {
    if (selectedStaffId !== "all" && apt.team_member_id !== selectedStaffId) {
      return false;
    }
    if (!options.showCancelled && apt.status === "cancelled") {
      return false;
    }
    return true;
  });

  // Group multi-service bookings into one row (same booking_id = same booking)
  const mergeMultiServiceBooking = (apts: Appointment[]): Appointment[] => {
    const byBooking = new Map<string, Appointment[]>();
    for (const apt of apts) {
      const key = (apt as { booking_id?: string }).booking_id || apt.id;
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push(apt);
    }
    return [...byBooking.values()].map((group) => {
      if (group.length === 1) return group[0];
      const first = group[0];
      const services = [...new Set(group.map((a) => a.service_name))].join(", ");
      const totalDuration = group.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
      return {
        ...first,
        service_name: services,
        duration_minutes: totalDuration,
        // Use first apt's price/total_amount (booking total, not sum of services)
        price: (first as { total_amount?: number }).total_amount ?? first.price ?? 0,
      } as Appointment;
    });
  };

  // Group appointments by date and staff (incl. Unassigned)
  const UNASSIGNED_ID = "__unassigned__";
  const unassignedMember: TeamMember = { id: UNASSIGNED_ID, name: "Unassigned", role: "employee", email: "", mobile: "", is_active: true };
  const staffList = selectedStaffId === "all"
    ? [unassignedMember, ...teamMembers]
    : teamMembers.filter((m) => m.id === selectedStaffId);

  const groupedByDateAndStaff = dates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dateAppointments = filteredAppointments.filter(
      (apt) => toDateStr(apt.scheduled_date) === dateStr
    );

    const byStaff = staffList.map((member) => {
      const staffApts = dateAppointments.filter(
        (apt) =>
          (member.id === UNASSIGNED_ID && !apt.team_member_id) ||
          apt.team_member_id === member.id
      );
      const merged = mergeMultiServiceBooking(
        staffApts.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
      );
      return { member, appointments: merged };
    });

    return { date, byStaff };
  });

  // Handle print
  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Schedule - ${format(selectedDate, "MMM d, yyyy")}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding: 20px; 
              color: #1a1a1a;
              font-size: 11px;
              line-height: 1.4;
            }
            .header { 
              border-bottom: 2px solid #1a1f3c; 
              padding-bottom: 12px; 
              margin-bottom: 16px; 
            }
            .header h1 { 
              font-size: 18px; 
              font-weight: 700; 
              color: #1a1f3c; 
            }
            .header p { 
              color: #666; 
              font-size: 12px; 
              margin-top: 4px;
            }
            .date-section { 
              margin-bottom: 20px; 
              page-break-inside: avoid;
            }
            .date-header { 
              background: #f5f5f5; 
              padding: 8px 12px; 
              font-weight: 600; 
              font-size: 12px;
              border-radius: 4px;
              margin-bottom: 8px;
            }
            .staff-section { 
              margin-bottom: 12px; 
              page-break-inside: avoid;
            }
            .staff-header { 
              font-weight: 600; 
              color: #1a1f3c; 
              padding: 4px 0;
              border-bottom: 1px solid #e0e0e0;
              margin-bottom: 6px;
            }
            .appointment { 
              display: flex; 
              padding: 6px 8px; 
              border-left: 3px solid #4fd1c5; 
              background: #fafafa;
              margin-bottom: 4px;
              border-radius: 0 4px 4px 0;
            }
            .appointment.cancelled { 
              border-left-color: #ef4444; 
              opacity: 0.7;
              text-decoration: line-through;
            }
            .appointment.completed { 
              border-left-color: #9ca3af; 
            }
            .time { 
              min-width: 65px; 
              font-weight: 600; 
              color: #1a1f3c;
            }
            .details { 
              flex: 1; 
              min-width: 0;
            }
            .client-name { 
              font-weight: 600; 
            }
            .service-name { 
              color: #666; 
              font-size: 10px;
            }
            .client-contact { 
              color: #888; 
              font-size: 10px; 
            }
            .price { 
              text-align: right; 
              min-width: 60px;
              font-weight: 600;
              color: #FF0077;
            }
            .notes { 
              font-size: 10px; 
              color: #666; 
              font-style: italic;
              margin-top: 2px;
              padding-left: 65px;
            }
            .no-appointments { 
              color: #999; 
              font-style: italic; 
              padding: 8px;
            }
            .footer { 
              margin-top: 20px; 
              padding-top: 12px; 
              border-top: 1px solid #e0e0e0; 
              font-size: 10px; 
              color: #888; 
              text-align: center;
            }
            .compact .appointment { padding: 4px 8px; }
            .compact .details { font-size: 10px; }
            @media print {
              body { padding: 10px; }
              .date-section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body class="${options.compactView ? "compact" : ""}">
          ${printContent.innerHTML}
          <div class="footer">
            Printed on ${format(new Date(), "PPp")} • Beautonomi
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <div className="p-1.5 rounded-lg bg-[#FF0077]/10">
                <Printer className="w-4 h-4 text-[#FF0077]" />
              </div>
              Print Schedule
            </DialogTitle>
          </DialogHeader>

          {/* Options - compact */}
          <div className="px-4 pb-3 flex-shrink-0 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <Label className="text-xs font-medium text-gray-500">Staff</Label>
                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center pt-1 sm:pt-0">
                  {[
                  { key: "showClientPhone", label: "Phone" },
                  { key: "showClientEmail", label: "Email" },
                  { key: "showServicePrice", label: "Price" },
                  { key: "showNotes", label: "Notes" },
                  { key: "showCancelled", label: "Include Cancelled" },
                  { key: "compactView", label: "Compact" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                    <Checkbox
                      checked={options[key as keyof typeof options] as boolean}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, [key]: !!checked })
                      }
                      className="h-4 w-4 rounded-md border-2 border-gray-300 data-[state=checked]:bg-[#FF0077] data-[state=checked]:border-[#FF0077] data-[state=checked]:text-white transition-colors group-hover:border-gray-400"
                    />
                    <span className="text-xs text-gray-600">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview - uses same structure as print output for consistent preview */}
          <div className="flex-1 min-h-0 overflow-y-auto border-y border-gray-200 px-4 py-3 bg-gray-50/50 max-h-[45vh]">
            <style>{`
              [data-print-preview] .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
              [data-print-preview] .date-section { margin-bottom: 12px; }
              [data-print-preview] .date-header { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 6px; }
              [data-print-preview] .staff-section { margin-bottom: 12px; }
              [data-print-preview] .staff-header { border-bottom: 1px solid #f3f4f6; padding-bottom: 6px; margin-bottom: 6px; }
              [data-print-preview] .appointment { display: flex; padding: 6px 8px; border-left: 3px solid #4fd1c5; background: #fafafa; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
              [data-print-preview] .appointment.cancelled { border-left-color: #ef4444; opacity: 0.7; text-decoration: line-through; }
              [data-print-preview] .appointment.completed { border-left-color: #9ca3af; }
              [data-print-preview] .time { min-width: 50px; font-weight: 600; color: #1a1f3c; font-size: 11px; }
              [data-print-preview] .time .duration { color: #6b7280; font-weight: 400; font-size: 10px; }
              [data-print-preview] .details { flex: 1; min-width: 0; font-size: 11px; }
              [data-print-preview] .client-name { font-weight: 600; }
              [data-print-preview] .service-name { color: #666; font-size: 10px; }
              [data-print-preview] .client-contact { color: #888; font-size: 10px; }
              [data-print-preview] .price { text-align: right; min-width: 45px; font-weight: 600; color: #FF0077; font-size: 11px; }
              [data-print-preview] .notes { font-size: 10px; color: #666; font-style: italic; margin-top: 2px; padding-left: 50px; }
              [data-print-preview] .no-appointments { color: #9ca3af; font-style: italic; font-size: 11px; padding: 8px 0; }
            `}</style>
            <div ref={printRef} data-print-preview className="min-h-full bg-white rounded-lg border border-gray-200 p-3 shadow-sm text-xs">
            {/* Header */}
            <div className="header border-b border-gray-200 pb-2 mb-3">
              <h1 className="text-sm font-semibold text-gray-900">
                {view === "day"
                  ? `Schedule for ${format(selectedDate, "EEEE, MMM d, yyyy")}`
                  : `Week: ${format(dates[0], "MMM d")} – ${format(dates[6], "MMM d, yyyy")}`}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedStaffId === "all"
                  ? `All Staff Members (${teamMembers.length})`
                  : teamMembers.find((m) => m.id === selectedStaffId)?.name}
                {" • "}
                {(() => {
                  const count = new Set(filteredAppointments.map((a) => (a as { booking_id?: string }).booking_id || a.id)).size;
                  return `${count} appointment${count !== 1 ? "s" : ""}`;
                })()}
              </p>
            </div>

            {/* Content */}
            {groupedByDateAndStaff.map(({ date, byStaff }) => (
              <div key={date.toISOString()} className="date-section">
                {view === "week" && (
                  <div className="date-header">
                    {format(date, "EEEE, MMM d")}
                  </div>
                )}

                {byStaff.map(({ member, appointments: staffAppointments }) => (
                  <div key={member.id} className="staff-section mb-3">
                    <div className="staff-header flex items-center gap-1.5 text-xs font-semibold text-gray-700 pb-1.5 border-b border-gray-100">
                      <User className="w-3.5 h-3.5" />
                      {member.name}
                    </div>

                    {staffAppointments.length === 0 ? (
                      <div className="no-appointments text-xs text-gray-400 italic py-2">No appointments</div>
                    ) : (
                      staffAppointments.map((apt) => (
                        <div key={apt.id}>
                          <div
                            className={cn(
                              "appointment",
                              apt.status === "cancelled" && "cancelled",
                              apt.status === "completed" && "completed"
                            )}
                          >
                            <div className="time">
                              {apt.scheduled_time}
                              <div className="duration">{apt.duration_minutes}min</div>
                            </div>
                            <div className="details">
                              <div className="client-name">{apt.client_name}</div>
                              <div className="service-name">{apt.service_name}</div>
                              {(options.showClientPhone && apt.client_phone) ||
                              (options.showClientEmail && apt.client_email) ? (
                                <div className="client-contact">
                                  {options.showClientPhone && apt.client_phone}
                                  {options.showClientPhone &&
                                    options.showClientEmail &&
                                    apt.client_phone &&
                                    apt.client_email &&
                                    " • "}
                                  {options.showClientEmail && apt.client_email}
                                </div>
                              ) : null}
                            </div>
                            {options.showServicePrice && (
                              <div className="price">
                                R{((apt as { total_amount?: number }).total_amount ?? apt.price ?? 0).toFixed(0)}
                              </div>
                            )}
                          </div>
                          {options.showNotes && apt.notes && (
                            <div className="notes">Note: {apt.notes}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 px-4 py-3 border-t bg-white flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-[#FF0077] hover:bg-[#D60565]"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
