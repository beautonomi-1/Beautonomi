"use client";

import type { BookingNextStepIcon } from "@beautonomi/provider-booking";
import {
  AlertCircle,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Navigation,
  PlayCircle,
  QrCode,
  Timer,
  UserCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingSectionCard } from "./BookingSectionCard";

const ICON_MAP: Record<BookingNextStepIcon, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  "alert-circle-outline": AlertCircle,
  "navigate-outline": Navigation,
  "qr-code-outline": QrCode,
  "play-circle-outline": PlayCircle,
  "time-outline": Clock,
  "person-circle-outline": UserCircle,
  "car-outline": Car,
  "timer-outline": Timer,
  "card-outline": CreditCard,
  "checkmark-circle-outline": CheckCircle2,
  "close-circle-outline": XCircle,
  "calendar-outline": Calendar,
};

interface BookingNextStepCardProps {
  title: string;
  description: string;
  icon: BookingNextStepIcon;
  color: string;
  className?: string;
}

export function BookingNextStepCard({
  title,
  description,
  icon,
  color,
  className,
}: BookingNextStepCardProps) {
  const Icon = ICON_MAP[icon] ?? Calendar;

  return (
    <BookingSectionCard className={cn("flex gap-3", className)}>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{description}</p>
      </div>
    </BookingSectionCard>
  );
}
