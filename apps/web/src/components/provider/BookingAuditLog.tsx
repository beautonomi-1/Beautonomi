"use client";

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
      created: "Created",
      confirmed: "Confirmed",
      service_started: "Service Started",
      service_completed: "Service Completed",
      cancelled: "Cancelled",
      status_changed: "Status Changed",
      payment_received: "Payment Received",
      refunded: "Refunded",
      rescheduled: "Rescheduled",
      note_added: "Note Added",
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
            <History className="w-4 h-4 mr-2" />
            View History
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Booking History & Audit Log
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="py-8">
              <LoadingTimeout loadingMessage="Loading audit log..." />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No audit log entries found
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
                          Reason: {entry.event_data.reason}
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
                      <span>{entry.created_by_name || "System"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(entry.created_at).toLocaleString("en-US", {
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
