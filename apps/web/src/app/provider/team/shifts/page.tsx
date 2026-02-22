"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Shift, TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Pencil } from "lucide-react";
import { ShiftCreateEditDialog } from "./components/ShiftCreateEditDialog";
import { toast } from "sonner";

export default function ProviderShifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  });
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [shiftsData, members] = await Promise.all([
        providerApi.listShifts(weekStart.toISOString().split("T")[0]),
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
  };

  const navigateWeek = (direction: "prev" | "next") => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
    setWeekStart(newDate);
  };

  const goToToday = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day;
    setWeekStart(new Date(date.setDate(diff)));
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getShiftForMemberAndDay = (memberId: string, date: string) => {
    return shifts.find(
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

  const handleSave = () => {
    setIsCreateDialogOpen(false);
    setSelectedShift(null);
    setSelectedMember(null);
    setSelectedDate("");
    loadData();
    toast.success(selectedShift ? "Shift updated" : "Shift created");
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
                      const shift = getShiftForMemberAndDay(
                        member.id,
                        day.toISOString().split("T")[0]
                      );
                      return (
                        <TableCell key={dayIndex} className="text-center">
                          {shift ? (
                            <div className="flex items-center justify-center gap-2">
                              <Badge variant="outline" className="bg-[#FF0077]/10 text-[#FF0077] border-[#FF0077]/20">
                                {shift.start_time} - {shift.end_time}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleEditShift(shift)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddShift(member.id, day.toISOString().split("T")[0])}
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
        onSave={handleSave}
      />
    </div>
  );
}
