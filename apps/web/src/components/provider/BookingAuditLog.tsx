"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { History, User, Clock } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

interface AuditLogEntry {
  id: string;
  booking_id: string;
  event_type: string;
  event_data: {
    previous_status?: string;
    new_status?: string;
    field?: string;
    old_value?: any;
    new_value?: any;
    reason?: string;
  };
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

interface BookingAuditLogProps {
  bookingId: string;
  trigger?: React.ReactNode;
}

export function BookingAuditLog({ bookingId, trigger }: BookingAuditLogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && bookingId) {
      loadAuditLogs();
    }
  }, [isOpen, bookingId]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: AuditLogEntry[] }>(
        `/api/provider/bookings/${bookingId}/audit-log`
      );
      setAuditLogs(response.data || []);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
      setAuditLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventTypeLabel = (eventType: string): string => {
    const labels: Record<string, string> = {
      created: t("web.auditLog.created"),
      confirmed: t("web.auditLog.confirmed"),
      service_started: t("web.auditLog.serviceStarted"),
      service_completed: t("web.auditLog.serviceCompleted"),
      cancelled: t("web.auditLog.cancelled"),
      status_changed: t("web.auditLog.statusChanged"),
      payment_received: t("web.auditLog.paymentReceived"),
      refunded: t("web.auditLog.refunded"),
      rescheduled: t("web.auditLog.rescheduled"),
      note_added: t("web.auditLog.noteAdded"),
    };
    return labels[eventType] || eventType;
  };

  const getStatusColor = (status?: string): string => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-green-100 text-green-800",
      in_progress: "bg-blue-100 text-blue-800",
      completed: "bg-purple-100 text-purple-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status || ""] || "bg-gray-100 text-gray-800";
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 me-2" />
            {t("web.auditLog.viewHistory")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {t("web.auditLog.title")}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pe-4">
          {isLoading ? (
            <div className="py-8">
              <LoadingTimeout loadingMessage={t("web.auditLog.loading")} />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {t("web.auditLog.empty")}
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">
                          {getEventTypeLabel(entry.event_type)}
                        </Badge>
                        {entry.event_data.previous_status && (
                          <>
                            <span className="text-gray-400">→</span>
                            <Badge className={getStatusColor(entry.event_data.previous_status)}>
                              {entry.event_data.previous_status}
                            </Badge>
                            <span className="text-gray-400">→</span>
                            <Badge className={getStatusColor(entry.event_data.new_status)}>
                              {entry.event_data.new_status}
                            </Badge>
                          </>
                        )}
                      </div>
                      {entry.event_data.reason && (
                        <p className="text-sm text-gray-600 mb-2">
                          {t("web.auditLog.reason", { reason: entry.event_data.reason })}
                        </p>
                      )}
                      {entry.event_data.field && (
                        <p className="text-sm text-gray-600">
                          {entry.event_data.field}:{" "}
                          <span className="line-through text-red-500">
                            {String(entry.event_data.old_value)}
                          </span>{" "}
                          →{" "}
                          <span className="text-green-500">
                            {String(entry.event_data.new_value)}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{entry.created_by_name || t("web.auditLog.system")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(entry.created_at).toLocaleString(getDefaultMoneyLocale(), {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
