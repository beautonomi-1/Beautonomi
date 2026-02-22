"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ProviderSidebar } from "./ProviderSidebar";
import { ProviderTopbar } from "./ProviderTopbar";
import { ProviderBottomNav } from "./ProviderBottomNav";
import { useProviderSidebar } from "@/contexts/ProviderSidebarContext";
import { cn } from "@/lib/utils";

export function ProviderShell({ children }: { children: React.ReactNode }) {
  const { isExpanded } = useProviderSidebar();
  const pathname = usePathname();

  // Pages that need special full-height treatment
  const isCalendarPage = pathname?.startsWith("/provider/calendar");
  const isWaitingRoomPage = pathname?.startsWith("/provider/waiting-room");
  const isFullHeightPage = isCalendarPage || isWaitingRoomPage;

  return (
    <div className={cn(
      "bg-gray-50 overflow-x-hidden w-full max-w-full box-border",
      // Mobile: always min-h-screen for natural page scrolling (fluid layout)
      // Desktop: h-screen for full-height pages to enable viewport-constrained layout
      "min-h-screen",
      isFullHeightPage && "md:h-screen md:max-h-screen"
    )}>
      {/* Desktop Sidebar */}
      <ProviderSidebar />
      
      {/* Main Content Area */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out w-full max-w-full min-w-0 overflow-x-hidden box-border",
          // Mobile: natural flow (no min-h-screen); Desktop: fill viewport
          "flex flex-col md:min-h-screen",
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
          // Desktop: flex-1 to fill viewport height; Mobile: natural flow (page scrolls)
          "md:flex-1 md:min-h-0",
          isFullHeightPage 
            ? "px-0 py-0 md:px-4 md:py-4 lg:px-6 md:overflow-hidden" 
            : "px-4 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 lg:py-8 max-w-[1600px] mx-auto"
        )}>
          <div className={cn(
            "w-full max-w-full box-border",
            isFullHeightPage ? "md:h-full md:flex md:flex-col" : ""
          )}>
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <ProviderBottomNav />
    </div>
  );
}
