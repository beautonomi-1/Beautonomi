"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import LimitWarning from "./LimitWarning";
import { fetcher } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface UsageData {
  feature_type: string;
  current_usage: number;
  limit_value: number | null;
  percentage_used: number;
  is_unlimited: boolean;
  can_use: boolean;
  warning_threshold: boolean;
}

export default function UsageSummary() {
  const { user } = useAuth();
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsage = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch usage summary
        const response = await fetcher.get<{ data: UsageData[] }>(
          `/api/provider/usage-summary`
        );
        setUsageData(response.data || []);
      } catch (error) {
        console.error("Error loading usage summary:", error);
        // Don't show error to user, just return empty
        setUsageData([]);
      } finally {
        setLoading(false);
      }
    };

    loadUsage();
  }, [user]);

  if (loading) {
    return <LoadingTimeout loadingMessage="Loading usage..." />;
  }

  if (usageData.length === 0) {
    return null;
  }

  const getFeatureLabel = (type: string) => {
    const labels: Record<string, string> = {
      bookings: "Bookings This Month",
      messages: "Messages This Month",
      staff: "Staff Members",
      locations: "Locations",
    };
    return labels[type] || type;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription Usage</CardTitle>
        <CardDescription>
          Track your current usage against plan limits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usageData.map((usage) => {
          if (usage.is_unlimited) {
            return (
              <div key={usage.feature_type} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    {getFeatureLabel(usage.feature_type)}
                  </span>
                  <span className="text-sm text-green-600 font-semibold">
                    Unlimited
                  </span>
                </div>
              </div>
            );
          }

          const percentage = usage.percentage_used;
          const isWarning = usage.warning_threshold && percentage < 100;
          const isExceeded = !usage.can_use;

          return (
            <div key={usage.feature_type} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">
                  {getFeatureLabel(usage.feature_type)}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    isExceeded
                      ? "text-red-600"
                      : isWarning
                      ? "text-yellow-600"
                      : "text-gray-600"
                  }`}
                >
                  {usage.current_usage} / {usage.limit_value}
                </span>
              </div>
              <Progress
                value={Math.min(percentage, 100)}
                className={`h-2 ${
                  isExceeded
                    ? "bg-red-100"
                    : isWarning
                    ? "bg-yellow-100"
                    : ""
                }`}
              />
              {(isWarning || isExceeded) && (
                <LimitWarning
                  featureType={usage.feature_type as any}
                  currentUsage={usage.current_usage}
                  limit={usage.limit_value}
                  percentageUsed={percentage}
                  planName="Current Plan"
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
