"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import BookingsList from "./components/bookings-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { useAuth } from "@/providers/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useCustomerBookingsRealtime } from "@/hooks/useSupabaseRealtime";
import type { Booking } from "@/types/beautonomi";

export default function BookingsPageClient({
  initialUpcoming,
}: {
  initialUpcoming: Booking[];
}) {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user } = useAuth();
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["upcoming"]));
  const onTabChange = useCallback((next: string) => {
    setActiveTab(next);
    setVisitedTabs((prev) => {
      if (prev.has(next)) return prev;
      const out = new Set(prev);
      out.add(next);
      return out;
    });
  }, []);

  const handleRealtimeEvent = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  useCustomerBookingsRealtime(
    user ? getSupabaseClient() : null,
    user?.id,
    handleRealtimeEvent,
  );

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <BackButton href="/account-settings" />
        <Breadcrumb
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Bookings" },
          ]}
        />

        <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-2">Bookings</h1>
          <p className="text-sm md:text-base text-gray-600 font-light">
            Manage your appointments and view your booking history
          </p>
        </div>

        <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8">
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="mb-6 md:mb-8 grid grid-cols-3 w-full bg-gray-100/50 p-1 rounded-xl">
              <TabsTrigger
                value="upcoming"
                className="text-sm md:text-base font-medium data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-sm transition-all"
              >
                Upcoming
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="text-sm md:text-base font-medium data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-sm transition-all"
              >
                Past
              </TabsTrigger>
              <TabsTrigger
                value="cancelled"
                className="text-sm md:text-base font-medium data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-sm transition-all"
              >
                Cancelled
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-0">
              {visitedTabs.has("upcoming") && (
                <BookingsList
                  status="upcoming"
                  refreshTrigger={refreshTrigger}
                  initialSeed={initialUpcoming}
                />
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-0">
              {visitedTabs.has("past") && (
                <BookingsList status="past" refreshTrigger={refreshTrigger} />
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-0">
              {visitedTabs.has("cancelled") && (
                <BookingsList status="cancelled" refreshTrigger={refreshTrigger} />
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-8 pt-6 border-t border-gray-200/50">
            <p className="text-xs md:text-sm font-light text-gray-600 text-center">
              Can&apos;t find your reservation here?{" "}
              <Link
                href="/help"
                className="underline text-[#FF0077] hover:text-[#D60565] font-medium transition-colors"
              >
                Visit the Help Center
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
