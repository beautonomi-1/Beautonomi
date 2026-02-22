"use client";

/**
 * Waiting Room Button - Floating badge showing count
 * 
 * Shows a floating button just above the pink "+" FAB (bottom-right)
 * with badge count of WAITING appointments for the current day.
 * Uses a Sofa/ArmChair icon to distinguish it from the add appointment button.
 * 
 * @module components/waitingRoom/WaitingRoomButton
 */

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Armchair } from "lucide-react";

interface WaitingRoomButtonProps {
  count: number;
  onClick: () => void;
  className?: string;
}

export function WaitingRoomButton({ count, onClick, className }: WaitingRoomButtonProps) {
  const hasWaiting = count > 0;

  // Mirror the ProviderBottomNav scroll-hide logic so we stay above the FAB
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      if (lastScrollY.current > y) setNavVisible(true);
      else if (y > 100) setNavVisible(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        // Position: bottom-right, just ABOVE the pink "+" FAB
        // FAB = ~44px (p-3 + w-5 icon). When nav visible: FAB at bottom-24 (96px) → our bottom = 96+44+4 = 144px = 9rem
        // When nav hidden: FAB at bottom-8 (32px) → our bottom = 32+44+4 = 80px = 5rem
        "md:hidden fixed right-4 z-40",
        navVisible ? "bottom-36" : "bottom-20",
        // Match FAB size: p-3 with w-5 icon = ~44px total → use h-11 w-11
        "h-11 w-11 rounded-full p-0",
        // Distinct colour: violet/purple gradient (vs pink FAB)
        "bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600",
        "hover:from-violet-700 hover:via-purple-700 hover:to-indigo-700",
        "active:from-violet-800 active:via-purple-800 active:to-indigo-800",
        "text-white",
        // Shadows
        "shadow-lg shadow-violet-600/30",
        "hover:shadow-xl hover:shadow-violet-600/40",
        // Smooth transitions
        "transition-all duration-300 ease-out",
        "hover:scale-105 active:scale-95",
        // Pulse when appointments are waiting
        hasWaiting && "animate-pulse",
        // Border
        "border-2 border-white/20 hover:border-white/30",
        className
      )}
      aria-label={`Waiting room${hasWaiting ? ` (${count} waiting)` : ""}`}
    >
      <div className="relative flex items-center justify-center">
        <Armchair className="w-5 h-5 transition-transform duration-300" />
        {hasWaiting && (
          <Badge
            className={cn(
              "absolute -top-2 -right-2",
              "min-w-[20px] h-[20px] rounded-full",
              "bg-gradient-to-br from-pink-500 to-rose-600",
              "text-white text-[9px] font-bold",
              "flex items-center justify-center px-0.5",
              "shadow-lg shadow-pink-500/50",
              "border-2 border-white",
              "animate-in zoom-in-50 duration-300"
            )}
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </div>
    </Button>
  );
}

export default WaitingRoomButton;
