"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Calendar, TrendingUp, DollarSign, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ZoneAnalytics {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  is_active: boolean;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  total_travel_fees: number;
  average_booking_value: number;
  completion_rate: number;
}

interface AnalyticsData {
  zones: ZoneAnalytics[];
  summary: {
    total_zones: number;
    active_zones: number;
    total_at_home_bookings: number;
    total_revenue: number;
    total_travel_fees: number;
    average_booking_value: number;
  };
  period: {
    start_date: string | null;
    end_date: string | null;
  };
}

export default function ServiceZoneAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: AnalyticsData }>(
        `/api/provider/service-zones/analytics?start_date=${startDate}&end_date=${endDate}`
      );
      setAnalytics(response.data);
    } catch (error) {
      toast.error("Failed to load analytics");
      console.error("Error loading analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Service Zones", href: "/provider/settings/service-zones" },
    { label: "Analytics" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage="Loading analytics..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title="Service Zone Analytics"
        subtitle="Track performance and bookings by service zone"
      />

      <div className="space-y-6">
        {/* Date Filter */}
        <SectionCard>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={loadAnalytics} className="bg-[#FF0077] hover:bg-[#D60565]">
              <Calendar className="w-4 h-4 mr-2" />
              Apply Filter
            </Button>
          </div>
        </SectionCard>

        {/* Summary Cards */}
        {analytics && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Zones</p>
                    <p className="text-2xl font-bold">{analytics.summary.total_zones}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {analytics.summary.active_zones} active
                    </p>
                  </div>
                  <MapPin className="w-8 h-8 text-[#FF0077]" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Bookings</p>
                    <p className="text-2xl font-bold">{analytics.summary.total_at_home_bookings}</p>
                    <p className="text-xs text-gray-500 mt-1">At-home bookings</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-500" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.total_revenue)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Avg: {formatCurrency(analytics.summary.average_booking_value)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Travel Fees</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.total_travel_fees)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Total collected</p>
                  </div>
                  <MapPin className="w-8 h-8 text-orange-500" />
                </div>
              </SectionCard>
            </div>

            {/* Zone Details */}
            <SectionCard>
              <h3 className="text-lg font-semibold mb-4">Zone Performance</h3>
              {analytics.zones.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No bookings found in selected period
                </p>
              ) : (
                <div className="space-y-4">
                  {analytics.zones.map((zone) => (
                    <div
                      key={zone.zone_id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{zone.zone_name}</h4>
                            <Badge variant={zone.is_active ? "default" : "secondary"}>
                              {zone.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{zone.zone_type}</Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-[#FF0077]">
                            {formatCurrency(zone.total_revenue)}
                          </p>
                          <p className="text-xs text-gray-500">Total Revenue</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-gray-600">Bookings</p>
                          <p className="text-lg font-semibold">{zone.total_bookings}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Completed</p>
                          <p className="text-lg font-semibold text-green-600">
                            {zone.completed_bookings}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Completion Rate</p>
                          <p className="text-lg font-semibold">
                            {zone.completion_rate.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Travel Fees</p>
                          <p className="text-lg font-semibold">
                            {formatCurrency(zone.total_travel_fees)}
                          </p>
                        </div>
                      </div>

                      {zone.cancelled_bookings > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-red-600">
                            {zone.cancelled_bookings} cancelled booking(s)
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
