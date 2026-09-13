"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Phone, MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import Image from "next/image";

interface BookingStatus {
  id: string;
  status: "pending" | "confirmed" | "provider_en_route" | "provider_arrived" | "in_progress" | "completed" | "cancelled";
  estimated_arrival?: string;
  provider_location?: {
    latitude: number;
    longitude: number;
  };
  queue_position?: number;
  estimated_wait_time?: number; // in minutes
}

interface VirtualWaitingRoomProps {
  bookingId: string;
  bookingDateTime: Date;
  providerName: string;
  providerImage?: string;
  providerPhone?: string;
  location: string;
  services: string[];
  onStatusUpdate?: (status: BookingStatus) => void;
}

export default function VirtualWaitingRoom({
  bookingId,
  bookingDateTime,
  providerName,
  providerImage,
  providerPhone,
  location,
  services,
  onStatusUpdate,
}: VirtualWaitingRoomProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BookingStatus>({
    id: bookingId,
    status: "pending",
  });
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/bookings/${bookingId}/status`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data.data);
          if (onStatusUpdate) onStatusUpdate(data.data);
        }
      } catch (error) {
        console.error("Error fetching booking status:", error);
      }
    }, 10000);

    const timeInterval = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(timeInterval);
    };
  }, [bookingId, onStatusUpdate]);

  const getStatusInfo = () => {
    switch (status.status) {
      case "pending":
        return {
          title: t("web.booking.virtualWaitingRoom.pendingTitle"),
          description: t("web.booking.virtualWaitingRoom.pendingDescription"),
          icon: Clock,
          color: "bg-yellow-100 text-yellow-800",
        };
      case "confirmed":
        return {
          title: t("web.booking.virtualWaitingRoom.confirmedTitle"),
          description: t("web.booking.virtualWaitingRoom.confirmedDescription"),
          icon: CheckCircle2,
          color: "bg-green-100 text-green-800",
        };
      case "provider_en_route":
        return {
          title: t("web.booking.virtualWaitingRoom.enRouteTitle"),
          description: status.estimated_arrival
            ? t("web.booking.virtualWaitingRoom.enRouteEta", {
                time: format(new Date(status.estimated_arrival), "h:mm a"),
              })
            : t("web.booking.virtualWaitingRoom.enRouteDescription"),
          icon: MapPin,
          color: "bg-blue-100 text-blue-800",
        };
      case "provider_arrived":
        return {
          title: t("web.booking.virtualWaitingRoom.arrivedTitle"),
          description: t("web.booking.virtualWaitingRoom.arrivedDescription"),
          icon: CheckCircle2,
          color: "bg-green-100 text-green-800",
        };
      case "in_progress":
        return {
          title: t("web.booking.virtualWaitingRoom.inProgressTitle"),
          description: t("web.booking.virtualWaitingRoom.inProgressDescription"),
          icon: Clock,
          color: "bg-purple-100 text-purple-800",
        };
      case "completed":
        return {
          title: t("web.booking.virtualWaitingRoom.completedTitle"),
          description: t("web.booking.virtualWaitingRoom.completedDescription"),
          icon: CheckCircle2,
          color: "bg-green-100 text-green-800",
        };
      case "cancelled":
        return {
          title: t("web.booking.virtualWaitingRoom.cancelledTitle"),
          description: t("web.booking.virtualWaitingRoom.cancelledDescription"),
          icon: AlertCircle,
          color: "bg-red-100 text-red-800",
        };
      default:
        return {
          title: t("web.booking.virtualWaitingRoom.unknownTitle"),
          description: t("web.booking.virtualWaitingRoom.unknownDescription"),
          icon: AlertCircle,
          color: "bg-gray-100 text-gray-800",
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const formatTimeElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t("web.booking.virtualWaitingRoom.title")}</span>
            {status.queue_position && status.queue_position > 0 && (
              <Badge variant="secondary">
                {t("web.booking.virtualWaitingRoom.queuePosition", {
                  position: status.queue_position,
                })}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={`rounded-lg p-4 ${statusInfo.color}`}>
            <div className="flex items-center gap-3">
              <StatusIcon className="w-6 h-6" />
              <div>
                <h3 className="font-semibold">{statusInfo.title}</h3>
                <p className="text-sm mt-1">{statusInfo.description}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {providerImage && (
                <div className="relative w-16 h-16 rounded-full overflow-hidden">
                  <Image
                    src={providerImage}
                    alt={providerName}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{providerName}</h3>
                <p className="text-sm text-gray-600">{location}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600 mb-1">{t("web.booking.virtualWaitingRoom.appointmentTime")}</p>
                <p className="font-medium">
                  {format(bookingDateTime, "MMM d, yyyy")}
                </p>
                <p className="font-medium">
                  {format(bookingDateTime, "h:mm a")}
                </p>
              </div>
              <div>
                <p className="text-gray-600 mb-1">{t("web.booking.virtualWaitingRoom.services")}</p>
                <p className="font-medium">{services.join(", ")}</p>
              </div>
            </div>
          </div>

          {status.status === "pending" && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t("web.booking.virtualWaitingRoom.timeElapsed")}</p>
                  <p className="text-2xl font-bold">{formatTimeElapsed(timeElapsed)}</p>
                </div>
                {status.estimated_wait_time && (
                  <div className="text-end">
                    <p className="text-sm text-gray-600">{t("web.booking.virtualWaitingRoom.estimatedWait")}</p>
                    <p className="text-lg font-semibold">
                      {t("web.booking.virtualWaitingRoom.estimatedWaitMin", {
                        minutes: status.estimated_wait_time,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {status.status === "provider_en_route" && status.provider_location && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-blue-900">{t("web.booking.virtualWaitingRoom.providerLocation")}</p>
              </div>
              <p className="text-sm text-blue-800">
                {t("web.booking.virtualWaitingRoom.providerOnTheWay")}
              </p>
              {status.estimated_arrival && (
                <p className="text-xs text-blue-700 mt-2">
                  {t("web.booking.virtualWaitingRoom.eta", {
                    eta: formatDistanceToNow(new Date(status.estimated_arrival)),
                  })}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t">
            {providerPhone && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={`tel:${providerPhone}`}>
                  <Phone className="w-4 h-4 me-2" />
                  {t("web.booking.virtualWaitingRoom.callProvider")}
                </a>
              </Button>
            )}
            <Button variant="outline" className="flex-1">
              <MessageSquare className="w-4 h-4 me-2" />
              {t("web.booking.virtualWaitingRoom.messageProvider")}
            </Button>
          </div>

          {status.status === "pending" || status.status === "confirmed" ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>{t("web.booking.virtualWaitingRoom.tipLabel")}</strong>{" "}
                {t("web.booking.virtualWaitingRoom.tipBody")}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
