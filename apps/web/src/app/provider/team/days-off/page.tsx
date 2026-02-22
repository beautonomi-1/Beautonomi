"use client";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon, Plus, X, Users, Calendar as CalendarIcon2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
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
}

export default function DaysOffPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");

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
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDayOff = () => {
    setSelectedMembers([]);
    setSelectedDate(undefined);
    setReason("");
    setIsDialogOpen(true);
  };

  const handleSaveDayOff = async () => {
    if (!selectedDate || selectedMembers.length === 0) {
      toast.error("Please select at least one team member and a date");
      return;
    }

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      // Save days off for all selected members
      for (const memberId of selectedMembers) {
        await fetcher.post(`/api/provider/staff/${memberId}/days-off`, {
          date: dateStr,
          reason: reason,
          type: reason, // Use reason as type for now
        });
      }
      
      toast.success(`Day off set for ${selectedMembers.length} team member(s)`);
      setIsDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Failed to save day off:", error);
      toast.error(error?.message || "Failed to save day off");
    }
  };

  const handleRemoveDayOff = async (dayOff: DayOff) => {
    if (!confirm("Are you sure you want to remove this day off?")) return;

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/staff/${dayOff.team_member_id}/days-off/${dayOff.id}`);
      toast.success("Day off removed");
      loadData();
    } catch (error: any) {
      console.error("Failed to remove day off:", error);
      toast.error(error?.message || "Failed to remove day off");
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
        title="Days Off"
        subtitle="Manage team member days off and time off requests"
        primaryAction={{
          label: "Set Day Off",
          onClick: handleAddDayOff,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <CalendarIcon2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Total Days Off</div>
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
              <div className="text-xs sm:text-sm text-gray-600">This Month</div>
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
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
              <CalendarIcon2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF0077]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Upcoming</div>
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
          <p className="text-gray-600 mb-4">No days off scheduled</p>
          <Button onClick={handleAddDayOff} className="min-h-[44px] touch-manipulation">
            <Plus className="w-4 h-4 mr-2" />
            Set Day Off
          </Button>
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Team Member</th>
                  <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-medium text-gray-700">Actions</th>
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
                            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs sm:text-sm">
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
                            <Badge variant="outline" className="text-xs">Past</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 text-xs">Upcoming</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{dayOff.reason || "-"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDayOff(dayOff)}
                          className="min-h-[36px] touch-manipulation"
                        >
                          <X className="w-4 h-4" />
                        </Button>
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
              Set Day Off
            </DialogTitle>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Set a day off for one or multiple team members
            </p>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Team Member Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm sm:text-base font-medium">Select Team Members</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs min-h-[32px] touch-manipulation"
                >
                  {selectedMembers.length === teamMembers.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                    onClick={() => toggleMemberSelection(member.id)}
                  >
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={() => toggleMemberSelection(member.id)}
                    />
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs">
                        {member.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium flex-1">{member.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <Label className="text-sm sm:text-base font-medium mb-2 block">Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal min-h-[44px] touch-manipulation",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason" className="text-sm sm:text-base font-medium">Reason (Optional)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Vacation, Sick leave, Personal"
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDayOff}
              className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              Set Day Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
