"use client";

import React, { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

const ProviderSidebar = dynamic(
  () => import("./ProviderSidebar").then(m => ({ default: m.ProviderSidebar })),
  { ssr: false, loading: () => null }
);
import { ProviderTopbar } from "./ProviderTopbar";
import { ProviderBottomNav } from "./ProviderBottomNav";
import { OnDemandIncomingOverlay } from "@/components/provider-portal/OnDemandIncomingOverlay";
import { ProviderBookingAlertListener } from "@/components/provider-portal/ProviderBookingAlertListener";
import { useProviderSidebar } from "@/contexts/ProviderSidebarContext";
import { cn } from "@/lib/utils";

const PRIMARY_ROUTES = [
  "/provider/dashboard",
  "/provider/calendar",
  "/provider/appointments",
  "/provider/bookings",
  "/provider/clients",
  "/provider/messaging",
  "/provider/more",
  "/provider/finance",
  "/provider/catalogue",
  "/provider/settings",
  "/provider/sales",
  "/provider/waitlist",
  "/provider/recurring-appointments",
  "/provider/express-booking",
  "/provider/front-desk",
  "/provider/orders",
  "/provider/ecommerce",
  "/provider/reports",
  "/provider/analytics",
  "/provider/team/payroll",
];

export function ProviderShell({ children }: { children: React.ReactNode }) {
  const { isExpanded } = useProviderSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;
    const run = () => {
      PRIMARY_ROUTES.forEach((route, index) => {
        window.setTimeout(() => router.prefetch(route), index * 120);
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    run();
    return undefined;
  }, [router]);

  // Pages that need special full-height treatment
  const isCalendarPage = pathname?.startsWith("/provider/calendar");
  const isWaitingRoomPage = pathname?.startsWith("/provider/waiting-room");
  const isMessagingPage = pathname?.startsWith("/provider/messaging");
  const isFullHeightPage = isCalendarPage || isWaitingRoomPage || isMessagingPage;

  return (
    <div className={cn(
      "bg-gray-50 overflow-x-hidden w-full max-w-full box-border",
      isFullHeightPage
        ? "flex flex-col min-h-[100dvh] md:h-screen md:max-h-screen"
        : "min-h-screen"
    )}>
      {/* Desktop Sidebar */}
      <ProviderSidebar />
      
      {/* Main Content Area */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out w-full max-w-full min-w-0 overflow-x-hidden box-border",
          // Mobile: natural flow (no min-h-screen); Desktop: fill viewport
          "flex flex-col md:min-h-screen",
          // Full-height pages need flex-1 on mobile so main can shrink for viewport-bound children (e.g. messaging).
          isFullHeightPage && "flex-1 min-h-0",
          // Desktop: strict height for full-height pages
          isFullHeightPage && "md:h-full",
          isExpanded 
            ? "pl-0 md:pl-64 lg:pl-64" 
            : "pl-0 md:pl-[72px] lg:pl-[72px]"
        )}
      >
        {/* Top Navigation */}
        <div className="flex-shrink-0">
          <ProviderTopbar />
        </div>
        
        {/* Main Content */}
        <main className={cn(
          "w-full max-w-full min-w-0 box-border",
          // Full-height routes: flex column on all breakpoints so nested chat/calendar can use min-h-0.
          isFullHeightPage
            ? "flex-1 flex flex-col min-h-0 overflow-hidden px-0 py-0 md:px-4 md:py-4 lg:px-6"
            : "md:flex-1 md:min-h-0 px-4 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 lg:py-8 max-w-[1600px] mx-auto"
        )}>
          <div className={cn(
            "w-full max-w-full box-border",
            isFullHeightPage ? "flex-1 flex flex-col min-h-0 md:h-full" : ""
          )}>
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <ProviderBottomNav />

      {/* On-demand accept: incoming request overlay + ringtone */}
      <OnDemandIncomingOverlay />
      <ProviderBookingAlertListener />
    </div>
  );
}
