"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, LogIn, LogOut, Edit, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface TimeCard {
  id: string;
  team_member_id: string;
  team_member_name: string;
  date: string;
  clock_in_time: string;
  clock_out_time?: string;
  total_hours?: number;
  status: "clocked_in" | "clocked_out";
}

export default function TimeClockPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [timeCards, setTimeCards] = useState<TimeCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("clock");
  const [_selectedMember, _setSelectedMember] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTimeCard, setEditingTimeCard] = useState<TimeCard | null>(null);

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members.filter((m) => m.is_active && m.time_clock_enabled));
      
      // Load time cards from API
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: TimeCard[] }>("/api/provider/time-clock");
      setTimeCards(response.data || []);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load data");
      setTimeCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockIn = async (memberId: string) => {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/staff/${memberId}/time-clock/clock-in`, {});
      toast.success("Clocked in successfully");
      loadData();
    } catch (error: any) {
      console.error("Failed to clock in:", error);
      toast.error(error?.message || "Failed to clock in");
    }
  };

  const handleClockOut = async (memberId: string) => {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/staff/${memberId}/time-clock/clock-out`, {});
      toast.success("Clocked out successfully");
      loadData();
    } catch (error: any) {
      console.error("Failed to clock out:", error);
      toast.error(error?.message || "Failed to clock out");
    }
  };

  const handlePinClockIn = async () => {
    if (!pin || pin.length !== 4) {
      toast.error("Please enter a 4-digit PIN");
      return;
    }

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: { staff_id: string } }>("/api/provider/time-clock/clock-in-pin", { pin });
      if (response.data) {
        toast.success("Clocked in successfully");
        setPin("");
        loadData();
      }
    } catch (error: any) {
      console.error("Failed to clock in with PIN:", error);
      toast.error(error?.message || "Invalid PIN");
    }
  };

  const handleEditTimeCard = (timeCard: TimeCard) => {
    setEditingTimeCard(timeCard);
    setIsEditDialogOpen(true);
  };

  const getClockedInMembers = () => {
    return timeCards.filter((tc) => tc.status === "clocked_in");
  };

  const getTodayTimeCards = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return timeCards.filter((tc) => tc.date === today);
  };

  const getTotalHoursToday = () => {
    return getTodayTimeCards().reduce((total, tc) => total + (tc.total_hours || 0), 0);
  };

  return (
    <div>
      <PageHeader
        title="Time Clock"
        subtitle="Manage staff clock in/out and time cards"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <LogIn className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Clocked In</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {getClockedInMembers().length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Today</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {getTodayTimeCards().length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Hours Today</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {getTotalHoursToday().toFixed(1)}h
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF0077]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Total Staff</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {teamMembers.length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
          <TabsTrigger value="clock" className="text-xs sm:text-sm">Clock In/Out</TabsTrigger>
          <TabsTrigger value="timecards" className="text-xs sm:text-sm">Time Cards</TabsTrigger>
        </TabsList>

        {/* Clock In/Out Tab */}
        <TabsContent value="clock" className="space-y-4 sm:space-y-6">
          {/* PIN Clock In (Front Desk) */}
          <SectionCard>
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-semibold">Front Desk Clock In</h3>
              <p className="text-xs sm:text-sm text-gray-500">
                Enter PIN to clock in/out on front desk device
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter 4-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  className="flex-1 min-h-[44px] touch-manipulation text-center text-2xl tracking-widest"
                />
                <Button
                  onClick={handlePinClockIn}
                  className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
                >
                  Clock In
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Staff Clock In/Out */}
          <SectionCard>
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-semibold">Staff Clock In/Out</h3>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : teamMembers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No staff members with time clock enabled
                </p>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => {
                    const isClockedIn = getClockedInMembers().some((tc) => tc.team_member_id === member.id);
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm sm:text-base">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isClockedIn ? (
                            <>
                              <Badge className="bg-green-100 text-green-800">Clocked In</Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleClockOut(member.id)}
                                className="min-h-[36px] touch-manipulation"
                              >
                                <LogOut className="w-4 h-4 mr-2" />
                                Clock Out
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleClockIn(member.id)}
                              className="bg-[#FF0077] hover:bg-[#D60565] min-h-[36px] touch-manipulation"
                            >
                              <LogIn className="w-4 h-4 mr-2" />
                              Clock In
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        {/* Time Cards Tab */}
        <TabsContent value="timecards" className="space-y-4 sm:space-y-6">
          <SectionCard className="p-0 overflow-hidden">
            {isLoading ? (
              <div className="p-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : timeCards.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No time cards found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Total Hours</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeCards.map((timeCard) => (
                      <TableRow key={timeCard.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs">
                                {timeCard.team_member_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{timeCard.team_member_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(timeCard.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">{timeCard.clock_in_time}</TableCell>
                        <TableCell className="text-sm">
                          {timeCard.clock_out_time || (
                            <Badge className="bg-green-100 text-green-800 text-xs">In Progress</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {timeCard.total_hours ? `${timeCard.total_hours.toFixed(1)}h` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTimeCard(timeCard)}
                            className="min-h-[36px] touch-manipulation"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Edit Time Card Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-semibold">Edit Time Card</DialogTitle>
          </DialogHeader>
          {editingTimeCard && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Clock In Time</Label>
                <Input
                  type="time"
                  defaultValue={editingTimeCard.clock_in_time}
                  className="mt-1.5 min-h-[44px] touch-manipulation"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Clock Out Time</Label>
                <Input
                  type="time"
                  defaultValue={editingTimeCard.clock_out_time || ""}
                  className="mt-1.5 min-h-[44px] touch-manipulation"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editingTimeCard) return;
                try {
                  const { fetcher } = await import("@/lib/http/fetcher");
                  const clockInInput = (document.querySelector('input[type="time"]') as HTMLInputElement)?.value;
                  const clockOutInput = (document.querySelectorAll('input[type="time"]')[1] as HTMLInputElement)?.value;
                  
                  const updateData: any = {};
                  if (clockInInput) {
                    const today = editingTimeCard.date;
                    updateData.clock_in_time = new Date(`${today}T${clockInInput}`).toISOString();
                  }
                  if (clockOutInput !== undefined) {
                    if (clockOutInput) {
                      const today = editingTimeCard.date;
                      updateData.clock_out_time = new Date(`${today}T${clockOutInput}`).toISOString();
                    } else {
                      updateData.clock_out_time = null;
                    }
                  }
                  
                  await fetcher.put(`/api/provider/staff/${editingTimeCard.team_member_id}/time-clock/${editingTimeCard.id}`, updateData);
                  toast.success("Time card updated");
                  setIsEditDialogOpen(false);
                  loadData();
                } catch (error: any) {
                  console.error("Failed to update time card:", error);
                  toast.error(error?.message || "Failed to update time card");
                }
              }}
              className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
