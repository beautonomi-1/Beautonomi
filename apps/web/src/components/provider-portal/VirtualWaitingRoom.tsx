"use client";

import React, { useState, useEffect } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, User, Clock, CheckCircle, RefreshCw, Eye } from "lucide-react";
import type { WaitingRoomEntry } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { format } from "date-fns";

interface VirtualWaitingRoomProps {
  onEntrySelect?: (entry: WaitingRoomEntry) => void;
}

export function VirtualWaitingRoom({ onEntrySelect: _onEntrySelect }: VirtualWaitingRoomProps) {
  const [entries, setEntries] = useState<WaitingRoomEntry[]>([]);
  const [_isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, _setStatusFilter] = useState<"all" | "waiting" | "in_service" | "completed">("all");

  useEffect(() => {
    loadEntries();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadEntries, 30000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const loadEntries = async () => {
    try {
      setIsLoading(true);
      const response = await providerApi.listWaitingRoomEntries();
      setEntries(response);
    } catch (error) {
      console.error("Failed to load waiting room entries:", error);
      toast.error("Failed to load waiting room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (entryId: string, newStatus: WaitingRoomEntry["status"]) => {
    try {
      await providerApi.updateWaitingRoomEntry(entryId, { status: newStatus });
      toast.success("Status updated");
      loadEntries();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status");
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = 
      entry.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.service_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.client_phone?.includes(searchQuery);
    
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const waitingEntries = filteredEntries.filter(e => e.status === "waiting");
  const inServiceEntries = filteredEntries.filter(e => e.status === "in_service");
  const completedEntries = filteredEntries.filter(e => e.status === "completed");

  const getStatusColor = (status: WaitingRoomEntry["status"]) => {
    switch (status) {
      case "waiting":
        return "bg-yellow-100 text-yellow-800";
      case "in_service":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "left":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatWaitTime = (checkedInTime: string) => {
    const now = new Date();
    const checkedIn = new Date(checkedInTime);
    const diffMinutes = Math.floor((now.getTime() - checkedIn.getTime()) / 60000);
    
    if (diffMinutes < 60) {
      return `${diffMinutes} min`;
    }
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Waiting</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {waitingEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">In Service</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {inServiceEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Completed</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {completedEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
              <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF0077]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Total</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {filteredEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by client name or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 min-h-[44px] touch-manipulation"
          />
        </div>
        <Button
          variant="outline"
          onClick={loadEntries}
          className="min-h-[44px] touch-manipulation"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Waiting Room Entries - Mobile First */}
      {filteredEntries.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No one in waiting room</h3>
          <p className="text-sm text-gray-500">
            Clients will appear here when they check in
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {/* Waiting */}
          {waitingEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Waiting ({waitingEntries.length})
              </h3>
              <div className="space-y-3">
                {waitingEntries.map((entry) => (
                  <SectionCard key={entry.id} className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-[#FF0077]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-base truncate">
                              {entry.client_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {entry.service_name}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm text-gray-600 ml-12">
                          {entry.team_member_name && (
                            <div>With: {entry.team_member_name}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span>Waiting: {formatWaitTime(entry.checked_in_time)}</span>
                            {entry.position && (
                              <span className="text-[#FF0077] font-medium">
                                • Position #{entry.position}
                              </span>
                            )}
                          </div>
                          <div>
                            Checked in: {format(new Date(entry.checked_in_time), "h:mm a")}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className={getStatusColor(entry.status)}>
                          {entry.status}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(entry.id, "in_service")}
                          className="bg-[#FF0077] hover:bg-[#D60565] text-white min-h-[36px] touch-manipulation"
                        >
                          Start Service
                        </Button>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {/* In Service */}
          {inServiceEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                In Service ({inServiceEntries.length})
              </h3>
              <div className="space-y-3">
                {inServiceEntries.map((entry) => (
                  <SectionCard key={entry.id} className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-base truncate">
                              {entry.client_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {entry.service_name}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm text-gray-600 ml-12">
                          {entry.team_member_name && (
                            <div>With: {entry.team_member_name}</div>
                          )}
                          <div>
                            Started: {format(new Date(entry.checked_in_time), "h:mm a")}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className={getStatusColor(entry.status)}>
                          {entry.status}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(entry.id, "completed")}
                          className="bg-green-600 hover:bg-green-700 text-white min-h-[36px] touch-manipulation"
                        >
                          Complete
                        </Button>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Completed ({completedEntries.length})
              </h3>
              <div className="space-y-3">
                {completedEntries.map((entry) => (
                  <SectionCard key={entry.id} className="p-4 sm:p-6 opacity-75">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-base truncate">
                              {entry.client_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {entry.service_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 ml-12">
                          Completed: {format(new Date(entry.checked_in_time), "h:mm a")}
                        </div>
                      </div>
                      <Badge className={getStatusColor(entry.status)}>
                        {entry.status}
                      </Badge>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
