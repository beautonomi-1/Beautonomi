"use client";

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";

interface SubscriptionGateProps {
  feature: string;
  message: string;
  upgradeMessage?: string;
  showUpgradeButton?: boolean;
  className?: string;
}

export function SubscriptionGate({
  feature: _feature,
  message,
  upgradeMessage = "Upgrade your subscription to unlock this feature",
  showUpgradeButton = true,
  className = "",
}: SubscriptionGateProps) {
  return (
    <Alert className={`border-yellow-200 bg-yellow-50 ${className}`}>
      <Lock className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex items-center justify-between">
        <div>
          <p className="font-medium text-yellow-800">{message}</p>
          {upgradeMessage && (
            <p className="text-sm text-yellow-700 mt-1">{upgradeMessage}</p>
          )}
        </div>
        {showUpgradeButton && (
          <Link href="/provider/subscription">
            <Button
              variant="default"
              size="sm"
              className="ml-4 bg-[#FF0077] hover:bg-[#D60565]"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Upgrade Plan
            </Button>
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
