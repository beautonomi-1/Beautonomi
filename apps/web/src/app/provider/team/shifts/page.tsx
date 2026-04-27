"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Shift, TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { ShiftCreateEditDialog } from "./components/ShiftCreateEditDialog";
import { toast } from "sonner";

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProviderShifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date();
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [shiftsData, members] = await Promise.all([
        providerApi.listShifts(formatLocalDate(weekStart)),
        providerApi.listTeamMembers(),
      ]);
      setShifts(shiftsData);
      setTeamMembers(members);
    } catch (error) {
      console.error("Failed to load shifts:", error);
      toast.error("Failed to load shifts");
    } finally {
      setIsLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const navigateWeek = (direction: "prev" | "next") => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
    setWeekStart(newDate);
  };

  const goToToday = () => {
    const date = new Date();
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    setWeekStart(date);
  };

  const getWeekDays = () => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getShiftsForMemberAndDay = (memberId: string, date: string): Shift[] => {
    return shifts.filter(
      (shift) => shift.team_member_id === memberId && shift.date === date
    );
  };

  const handleAddShift = (memberId?: string, date?: string) => {
    setSelectedShift(null);
    setSelectedMember(memberId ? teamMembers.find((m) => m.id === memberId) || null : null);
    setSelectedDate(date || "");
    setIsCreateDialogOpen(true);
  };

  const handleEditShift = (shift: Shift) => {
    setSelectedShift(shift);
    setSelectedMember(teamMembers.find((m) => m.id === shift.team_member_id) || null);
    setSelectedDate(shift.date);
    setIsCreateDialogOpen(true);
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (shift.source === "schedule") {
      toast.error("Weekly schedule entries can only be edited in Staff Schedules");
      return;
    }
    try {
      await providerApi.deleteShift(shift.id);
      toast.success("Shift deleted");
      loadData();
    } catch {
      toast.error("Failed to delete shift");
    }
  };

  const handleSaveShift = async (formData: {
    teamMemberId: string;
    date: string;
    startTime: string;
    endTime: string;
    isRepeating: boolean;
    repeatPattern: string;
    repeatEndDate: string;
    repeatEndsAfter: string;
    isAlternating: boolean;
    alternatingWeek: string;
  }) => {
    const isRecurring = formData.isRepeating || formData.isAlternating;
    const recurringPattern: Record<string, unknown> = {};
    if (isRecurring) {
      recurringPattern.pattern = formData.isAlternating ? "biweekly" : formData.repeatPattern;
      if (formData.repeatEndDate) recurringPattern.end_date = formData.repeatEndDate;
      if (formData.repeatEndsAfter) recurringPattern.ends_after = Number(formData.repeatEndsAfter);
    }
    if (formData.isAlternating) {
      recurringPattern.type = "alternating";
      recurringPattern.alternating_week = formData.alternatingWeek;
    }

    try {
      if (selectedShift && selectedShift.source !== "schedule") {
        await providerApi.updateShift(selectedShift.id, {
          date: formData.date,
          start_time: formData.startTime,
          end_time: formData.endTime,
          is_recurring: isRecurring,
          recurring_pattern: isRecurring ? recurringPattern : null,
        });
        toast.success("Shift updated");
      } else {
        await providerApi.createShift({
          team_member_id: formData.teamMemberId,
          date: formData.date,
          start_time: formData.startTime,
          end_time: formData.endTime,
          is_recurring: isRecurring,
          recurring_pattern: isRecurring ? recurringPattern : null,
        });
        toast.success("Shift created");
      }
      setIsCreateDialogOpen(false);
      setSelectedShift(null);
      setSelectedMember(null);
      setSelectedDate("");
      loadData();
    } catch {
      toast.error(selectedShift ? "Failed to update shift" : "Failed to create shift");
    }
  };

  const weekDays = getWeekDays();

  return (
    <div>
      <PageHeader
        title="Scheduled Shifts"
        subtitle="Manage your team's schedule"
        primaryAction={{
          label: "Add Shift",
          onClick: () => handleAddShift(),
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      <div className="mt-4 mb-2 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <p className="text-sm text-indigo-800">
          <strong>How shifts work:</strong> Shifts define when each staff member is available for bookings.
          You can create split shifts (e.g. 08:00–12:00 and 14:00–18:00), one-off date overrides, or repeating shifts.
          Staff with <strong>Custom Work Hours</strong> disabled in their settings will use the location&apos;s operating hours instead.
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-indigo-700">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#FF0077]/10 border border-[#FF0077]/20" /> Date-specific shift
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200" /> Weekly schedule
          </span>
          <span>Repeating shifts show on every matching future week until their end rule.</span>
        </div>
      </div>

      {/* Week Navigation */}
      <SectionCard className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateWeek("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateWeek("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="ml-4 font-medium">
              {weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
              {weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Shifts Table */}
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-12 text-center">
          <p className="text-gray-600 mb-4">No team members found</p>
          <Button variant="outline" onClick={() => window.location.href = "/provider/team/members"}>
            Add Team Members
          </Button>
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  {weekDays.map((day, index) => (
                    <TableHead key={index} className="text-center min-w-[120px]">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">
                          {day.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                        <span className="font-medium">
                          {day.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    {weekDays.map((day, dayIndex) => {
                      const dateStr = formatLocalDate(day);
                      const dayShifts = getShiftsForMemberAndDay(member.id, dateStr);
                      return (
                        <TableCell key={dayIndex} className="text-center p-1">
                          {dayShifts.length > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              {dayShifts.map((shift) => {
                                const isSchedule = shift.source === "schedule";
                                return (
                                  <div key={`${shift.id}-${shift.date}`} className="flex items-center justify-center gap-1">
                                    <Badge
                                      variant="outline"
                                      className={
                                        isSchedule
                                          ? "bg-blue-50 text-blue-700 border-blue-200 text-xs"
                                          : "bg-[#FF0077]/10 text-[#FF0077] border-[#FF0077]/20 text-xs"
                                      }
                                    >
                                      {shift.start_time} - {shift.end_time}
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => handleEditShift(shift)}
                                      title={isSchedule ? "Override with date-specific shift" : "Edit shift"}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    {!isSchedule && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-red-400 hover:text-red-600"
                                        onClick={() => handleDeleteShift(shift)}
                                        title="Delete shift"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 opacity-40 hover:opacity-100"
                                onClick={() => handleAddShift(member.id, dateStr)}
                                title="Add another shift"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddShift(member.id, dateStr)}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      <ShiftCreateEditDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        shift={selectedShift}
        member={selectedMember}
        date={selectedDate}
        members={teamMembers}
        onSave={handleSaveShift}
      />
    </div>
  );
}
