"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, DollarSign, Clock, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { handleError, withRetry } from "@/lib/provider-portal/error-handler";

interface StaffTotals {
  team_member_id: string;
  team_member_name: string;
  appointments_count: number;
  revenue: number;
  tips: number;
  hours_worked: number;
  commission: number;
  rating?: number;
}

export default function StaffTotalsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [totals, setTotals] = useState<StaffTotals[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    loadTeamMembers();
  }, []);

  useEffect(() => {
    if (activeTab === "daily") {
      loadDailyTotals();
    } else {
      loadWeeklyTotals();
    }
  }, [activeTab, selectedDate, weekStart, selectedMember]);

  const loadTeamMembers = async () => {
    try {
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members.filter((m) => m.is_active));
      if (members.length > 0 && !selectedMember) {
        setSelectedMember("all");
      }
    } catch (error) {
      handleError(error, {
        action: "loadTeamMembers",
        resource: "team members",
      });
    }
  };

  const loadDailyTotals = async () => {
    setIsLoading(true);
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      let endpoint = "/api/provider/staff/totals";
      const params = new URLSearchParams({
        date: dateStr,
        period: "daily"
      });
      
      if (selectedMember && selectedMember !== "all") {
        endpoint = `/api/provider/staff/${selectedMember}/totals`;
      }
      
      const response = await withRetry(
        () => fetcher.get<{ data: StaffTotals[] }>(
          `${endpoint}?${params.toString()}`
        ),
        {
          maxRetries: 2,
          retryDelay: 1000,
        }
      );
      
      setTotals(response.data || []);
    } catch (error) {
      handleError(error, {
        action: "loadDailyTotals",
        resource: "staff totals",
      });
      setTotals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWeeklyTotals = async () => {
    setIsLoading(true);
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(endOfWeek(weekStart), "yyyy-MM-dd");
      
      let endpoint = "/api/provider/staff/totals";
      const params = new URLSearchParams({
        start_date: weekStartStr,
        end_date: weekEndStr,
        period: "weekly"
      });
      
      if (selectedMember && selectedMember !== "all") {
        endpoint = `/api/provider/staff/${selectedMember}/totals`;
      }
      
      const response = await withRetry(
        () => fetcher.get<{ data: StaffTotals[] }>(
          `${endpoint}?${params.toString()}`
        ),
        {
          maxRetries: 2,
          retryDelay: 1000,
        }
      );
      
      setTotals(response.data || []);
    } catch (error) {
      handleError(error, {
        action: "loadWeeklyTotals",
        resource: "staff totals",
      });
      setTotals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateDate = (direction: "prev" | "next") => {
    if (activeTab === "daily") {
      setSelectedDate((prev) => {
        const newDate = new Date(prev);
        newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
        return newDate;
      });
    } else {
      setWeekStart((prev) => {
        const newDate = new Date(prev);
        newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
        return newDate;
      });
    }
  };

  const goToToday = () => {
    setSelectedDate(new Date());
    setWeekStart(startOfWeek(new Date()));
  };

  const getTotalStats = () => {
    return totals.reduce(
      (acc, total) => ({
        appointments: acc.appointments + total.appointments_count,
        revenue: acc.revenue + total.revenue,
        tips: acc.tips + total.tips,
        hours: acc.hours + total.hours_worked,
        commission: acc.commission + total.commission,
      }),
      { appointments: 0, revenue: 0, tips: 0, hours: 0, commission: 0 }
    );
  };

  const filteredTotals = selectedMember && selectedMember !== "all"
    ? totals.filter((t) => t.team_member_id === selectedMember)
    : totals;

  const stats = getTotalStats();

  return (
    <div>
      <PageHeader
        title="Staff Totals"
        subtitle="View daily and weekly performance metrics for your team"
      />

      {/* Date Navigation */}
      <SectionCard className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateDate("prev")} className="min-h-[44px] min-w-[44px] touch-manipulation">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={goToToday} className="min-h-[44px] touch-manipulation">
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateDate("next")} className="min-h-[44px] min-w-[44px] touch-manipulation">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="ml-2 sm:ml-4 font-medium text-sm sm:text-base">
              {activeTab === "daily"
                ? format(selectedDate, "EEEE, MMM d, yyyy")
                : `${format(weekStart, "MMM d")} - ${format(endOfWeek(weekStart), "MMM d, yyyy")}`}
            </span>
          </div>
          <Select value={selectedMember || "all"} onValueChange={setSelectedMember}>
            <SelectTrigger className="w-full sm:w-[200px] min-h-[44px] touch-manipulation">
              <SelectValue placeholder="All staff" />
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
      </SectionCard>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Appointments</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {stats.appointments}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Revenue</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                R{stats.revenue.toLocaleString()}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Tips</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                R{stats.tips.toLocaleString()}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Hours</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {stats.hours.toFixed(1)}h
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF0077]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Commission</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                R{stats.commission.toLocaleString()}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
          <TabsTrigger value="daily" className="text-xs sm:text-sm">Daily Totals</TabsTrigger>
          <TabsTrigger value="weekly" className="text-xs sm:text-sm">Weekly Totals</TabsTrigger>
        </TabsList>

        {/* Daily Totals */}
        <TabsContent value="daily" className="space-y-4 sm:space-y-6">
          <SectionCard className="p-0 overflow-hidden">
            {isLoading ? (
              <div className="p-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : filteredTotals.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No data for this date</p>
                <p className="text-sm text-gray-500">Select a different date or check back later</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">Appointments</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTotals.map((total) => (
                      <TableRow key={total.team_member_id}>
                        <TableCell>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Avatar className="w-8 h-8 sm:w-10 sm:h-10">
                              <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                                {total.team_member_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm sm:text-base">{total.team_member_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{total.appointments_count}</TableCell>
                        <TableCell className="text-right">R{total.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">R{total.tips.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{total.hours_worked.toFixed(1)}h</TableCell>
                        <TableCell className="text-right font-medium">R{total.commission.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {total.rating ? (
                            <span className="flex items-center justify-end gap-1">
                              <span className="font-medium">{total.rating.toFixed(1)}</span>
                              <span className="text-yellow-500">★</span>
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Weekly Totals */}
        <TabsContent value="weekly" className="space-y-4 sm:space-y-6">
          <SectionCard className="p-0 overflow-hidden">
            {isLoading ? (
              <div className="p-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : filteredTotals.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No data for this week</p>
                <p className="text-sm text-gray-500">Select a different week or check back later</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">Appointments</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTotals.map((total) => (
                      <TableRow key={total.team_member_id}>
                        <TableCell>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Avatar className="w-8 h-8 sm:w-10 sm:h-10">
                              <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                                {total.team_member_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm sm:text-base">{total.team_member_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{total.appointments_count}</TableCell>
                        <TableCell className="text-right">R{total.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">R{total.tips.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{total.hours_worked.toFixed(1)}h</TableCell>
                        <TableCell className="text-right font-medium">R{total.commission.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {total.rating ? (
                            <span className="flex items-center justify-end gap-1">
                              <span className="font-medium">{total.rating.toFixed(1)}</span>
                              <span className="text-yellow-500">★</span>
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
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
    </div>
  );
}
