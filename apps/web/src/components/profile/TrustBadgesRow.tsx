"use client";

import React from "react";
import { Check, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TrustBadgesRowProps {
  emailVerified: boolean;
  photoAdded: boolean;
  phoneVerified: boolean;
  identityVerified: "none" | "pending" | "verified" | "failed";
  onBadgeTap?: (badgeType: string) => void;
}

export default function TrustBadgesRow({
  emailVerified,
  photoAdded,
  phoneVerified,
  identityVerified,
  onBadgeTap,
}: TrustBadgesRowProps) {
  const badges = [
    {
      type: "email",
      label: "Email",
      verified: emailVerified,
      icon: emailVerified ? Check : X,
    },
    {
      type: "photo",
      label: "Photo",
      verified: photoAdded,
      icon: photoAdded ? Check : X,
    },
    {
      type: "phone",
      label: "Phone",
      verified: phoneVerified,
      icon: phoneVerified ? Check : X,
    },
    {
      type: "identity",
      label: "ID",
      verified: identityVerified === "verified",
      pending: identityVerified === "pending",
      icon: identityVerified === "pending" ? Clock : identityVerified === "verified" ? Check : X,
    },
  ];

  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {badges.map((badge) => {
        const Icon = badge.icon;
        const isClickable = onBadgeTap !== undefined;

        return (
          <Badge
            key={badge.type}
            variant={badge.verified ? "default" : "outline"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors",
              badge.verified
                ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200"
                : badge.pending
                ? "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200"
                : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200",
              !isClickable && "cursor-default"
            )}
            onClick={() => isClickable && onBadgeTap?.(badge.type)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{badge.label}</span>
          </Badge>
        );
      })}
    </div>
  );
}
