"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { AppointmentHistoryEntry } from "@/lib/provider-portal/types";
import { format } from "date-fns";
import { Clock, User, CheckCircle, XCircle, Edit, Calendar, FileText, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface AppointmentHistoryPanelProps {
  appointmentId: string;
}

export function AppointmentHistoryPanel({ appointmentId }: AppointmentHistoryPanelProps) {
  const [history, setHistory] = useState<AppointmentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [appointmentId]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.getAppointmentHistory(appointmentId);
      // Sort by date, newest first
      setHistory(data.sort((a, b) => 
        new Date(b.performed_date).getTime() - new Date(a.performed_date).getTime()
      ));
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: AppointmentHistoryEntry["action"]) => {
    switch (action) {
      case "created":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "updated":
        return <Edit className="w-4 h-4 text-blue-600" />;
      case "status_changed":
        return <CheckCircle className="w-4 h-4 text-purple-600" />;
      case "rescheduled":
        return <Calendar className="w-4 h-4 text-orange-600" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "note_added":
        return <FileText className="w-4 h-4 text-gray-600" />;
      case "payment_added":
        return <CreditCard className="w-4 h-4 text-green-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActionColor = (action: AppointmentHistoryEntry["action"]) => {
    switch (action) {
      case "created":
        return "bg-green-100 text-green-800";
      case "updated":
        return "bg-blue-100 text-blue-800";
      case "status_changed":
        return "bg-purple-100 text-purple-800";
      case "rescheduled":
        return "bg-orange-100 text-orange-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "note_added":
        return "bg-gray-100 text-gray-800";
      case "payment_added":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading history..." />;
  }

  if (history.length === 0) {
    return (
      <EmptyState
        title="No history"
        description="Appointment history will appear here as changes are made"
      />
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold mb-4">History</h3>
      <div className="space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="mt-0.5">{getActionIcon(entry.action)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={getActionColor(entry.action)}>
                  {entry.action.replace("_", " ")}
                </Badge>
                <span className="text-sm font-medium">{entry.description}</span>
              </div>
              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  {Object.entries(entry.changes).map(([key, change]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="font-medium capitalize">{key}:</span>
                      <span className="text-red-600 line-through">{String(change.from)}</span>
                      <span>→</span>
                      <span className="text-green-600">{String(change.to)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>{entry.performed_by_name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{format(new Date(entry.performed_date), "PPp")}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
