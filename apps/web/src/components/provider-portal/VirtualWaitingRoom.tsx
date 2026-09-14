"use client";

import React, { useState, useEffect, useRef } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, User, Clock, CheckCircle, RefreshCw, Eye } from "lucide-react";
import type { WaitingRoomEntry } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { useTranslation } from "@beautonomi/i18n";

interface VirtualWaitingRoomProps {
  onEntrySelect?: (entry: WaitingRoomEntry) => void;
  locationId?: string;
}

export function VirtualWaitingRoom({ onEntrySelect: _onEntrySelect, locationId }: VirtualWaitingRoomProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<WaitingRoomEntry[]>([]);
  const [_isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, _setStatusFilter] = useState<"all" | "waiting" | "in_service" | "completed">("all");
  const onDemandConfig = useModuleConfig("on_demand");
  const prevWaitingCountRef = useRef<number | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      ringtoneStopRef.current?.();
    };
  }, []);

  useEffect(() => {
    loadEntries();
    const interval = setInterval(loadEntries, 30000);
    return () => clearInterval(interval);
  }, [statusFilter, locationId]);

  const loadEntries = async () => {
    try {
      setIsLoading(true);
      const filters: { status?: string; location_id?: string } = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (locationId) filters.location_id = locationId;
      const response = await providerApi.listWaitingRoomEntries(Object.keys(filters).length ? filters : undefined);
      const waitingCount = response.filter((e) => e.status === "waiting").length;
      if (
        onDemandConfig.enabled &&
        onDemandConfig.ringtone_asset_path &&
        prevWaitingCountRef.current !== null &&
        waitingCount > prevWaitingCountRef.current
      ) {
        ringtoneStopRef.current?.();
        const ctrl = await playRingtone(
          {
            enabled: onDemandConfig.enabled,
            ringtone_asset_path: onDemandConfig.ringtone_asset_path,
            ring_duration_seconds: onDemandConfig.ring_duration_seconds ?? 20,
            ring_repeat: onDemandConfig.ring_repeat ?? true,
          },
          { environment: "production" }
        );
        ringtoneStopRef.current = ctrl.stop;
      }
      prevWaitingCountRef.current = waitingCount;
      setEntries(response);
    } catch (error) {
      console.error("Failed to load waiting room entries:", error);
      toast.error(t("web.provider.portal.waitingRoom.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (entryId: string, newStatus: WaitingRoomEntry["status"]) => {
    try {
      await providerApi.updateWaitingRoomEntry(entryId, { status: newStatus });
      toast.success(t("web.provider.portal.waitingRoom.statusUpdated"));
      loadEntries();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error(t("web.provider.portal.waitingRoom.statusUpdateFailed"));
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      (entry?.client_name ?? "").toLowerCase().includes((searchQuery ?? "").toLowerCase()) ||
      (entry?.service_name ?? "").toLowerCase().includes((searchQuery ?? "").toLowerCase()) ||
      (entry?.client_phone ?? "").includes(searchQuery ?? "");

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

  const statusLabel = (status: WaitingRoomEntry["status"]) => {
    switch (status) {
      case "waiting":
        return t("web.provider.portal.waitingRoom.waiting");
      case "in_service":
        return t("web.provider.portal.waitingRoom.inService");
      case "completed":
        return t("web.provider.portal.waitingRoom.completed");
      case "left":
        return t("web.provider.portal.waitingRoom.left");
      default:
        return status;
    }
  };

  const formatWaitTime = (checkedInTime: string) => {
    const now = new Date();
    const checkedIn = new Date(checkedInTime);
    const diffMinutes = Math.floor((now.getTime() - checkedIn.getTime()) / 60000);
    
    if (diffMinutes < 60) {
      return t("web.provider.portal.waitingRoom.waitMinutes", { minutes: diffMinutes });
    }
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return t("web.provider.portal.waitingRoom.waitHours", { hours, minutes });
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.portal.waitingRoom.waiting")}</div>
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
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.portal.waitingRoom.inService")}</div>
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
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.portal.waitingRoom.completed")}</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {completedEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">{t("web.provider.portal.waitingRoom.total")}</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {filteredEntries.length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={t("web.provider.portal.waitingRoom.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-10 min-h-[44px] touch-manipulation"
          />
        </div>
        <Button
          variant="outline"
          onClick={loadEntries}
          className="min-h-[44px] touch-manipulation"
        >
          <RefreshCw className="w-4 h-4 me-2" />
          <span className="hidden sm:inline">{t("web.provider.portal.waitingRoom.refresh")}</span>
        </Button>
      </div>

      {filteredEntries.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t("web.provider.portal.waitingRoom.emptyTitle")}</h3>
          <p className="text-sm text-gray-500">
            {t("web.provider.portal.waitingRoom.emptyDescription")}
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {waitingEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t("web.provider.portal.waitingRoom.waitingCount", { count: waitingEntries.length })}
              </h3>
              <div className="space-y-3">
                {waitingEntries.map((entry) => (
                  <SectionCard key={entry.id} className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-primary" />
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
                        <div className="space-y-1 text-xs sm:text-sm text-gray-600 ms-12">
                          {entry.team_member_name && (
                            <div>{t("web.provider.portal.waitingRoom.withStaff", { name: entry.team_member_name })}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span>{t("web.provider.portal.waitingRoom.waitingTime", { time: formatWaitTime(entry.checked_in_time) })}</span>
                            {entry.position && (
                              <span className="text-primary font-medium">
                                {t("web.provider.portal.waitingRoom.position", { position: entry.position })}
                              </span>
                            )}
                          </div>
                          <div>
                            {t("web.provider.portal.waitingRoom.checkedIn", {
                              time: format(new Date(entry.checked_in_time), "h:mm a"),
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className={getStatusColor(entry.status)}>
                          {statusLabel(entry.status)}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(entry.id, "in_service")}
                          className="bg-primary hover:bg-primary-hover text-white min-h-[36px] touch-manipulation"
                        >
                          {t("web.provider.portal.waitingRoom.startService")}
                        </Button>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {inServiceEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                {t("web.provider.portal.waitingRoom.inServiceCount", { count: inServiceEntries.length })}
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
                        <div className="space-y-1 text-xs sm:text-sm text-gray-600 ms-12">
                          {entry.team_member_name && (
                            <div>{t("web.provider.portal.waitingRoom.withStaff", { name: entry.team_member_name })}</div>
                          )}
                          <div>
                            {t("web.provider.portal.waitingRoom.started", {
                              time: format(new Date(entry.checked_in_time), "h:mm a"),
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className={getStatusColor(entry.status)}>
                          {statusLabel(entry.status)}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(entry.id, "completed")}
                          className="bg-green-600 hover:bg-green-700 text-white min-h-[36px] touch-manipulation"
                        >
                          {t("web.provider.portal.waitingRoom.complete")}
                        </Button>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {completedEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {t("web.provider.portal.waitingRoom.completedCount", { count: completedEntries.length })}
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
                        <div className="text-xs sm:text-sm text-gray-600 ms-12">
                          {t("web.provider.portal.waitingRoom.completedAt", {
                            time: format(new Date(entry.checked_in_time), "h:mm a"),
                          })}
                        </div>
                      </div>
                      <Badge className={getStatusColor(entry.status)}>
                        {statusLabel(entry.status)}
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
