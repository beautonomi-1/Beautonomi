"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Calendar, 
  Users,
  MessageSquare,
  Grid3x3,
  Plus
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function ProviderBottomNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const isScrollingUp = useRef(false);

  // Primary navigation tabs with improved structure
  const primaryTabs = [
    { 
      name: "Home", 
      icon: LayoutDashboard, 
      link: "/provider/dashboard",
      activeColor: "text-[#FF0077]",
      activeBg: "bg-[#FF0077]/10"
    },
    { 
      name: "Calendar", 
      icon: Calendar, 
      link: "/provider/calendar",
      activeColor: "text-[#4fd1c5]",
      activeBg: "bg-[#4fd1c5]/10"
    },
    { 
      name: "Clients", 
      icon: Users, 
      link: "/provider/clients",
      activeColor: "text-blue-500",
      activeBg: "bg-blue-50"
    },
    { 
      name: "Chats", 
      icon: MessageSquare, 
      link: "/provider/messaging",
      activeColor: "text-green-500",
      activeBg: "bg-green-50"
    },
    { 
      name: "More", 
      icon: Grid3x3, 
      link: "/provider/more",
      activeColor: "text-purple-500",
      activeBg: "bg-purple-50"
    },
  ];

  // Determine active tab based on current pathname
  const getActiveTab = () => {
    if (pathname === "/provider/dashboard") return "Home";
    if (pathname?.startsWith("/provider/calendar") || 
        pathname?.startsWith("/provider/appointments") ||
        pathname?.startsWith("/provider/bookings")) return "Calendar";
    if (pathname?.startsWith("/provider/clients")) return "Clients";
    if (pathname?.startsWith("/provider/messaging") || 
        pathname?.startsWith("/provider/chats")) return "Chats";
    // More includes hubs and secondary nav
    if (pathname?.startsWith("/provider/more") ||
        pathname?.startsWith("/provider/settings") ||
        pathname?.startsWith("/provider/reports") ||
        pathname?.startsWith("/provider/catalogue") ||
        pathname?.startsWith("/provider/team") ||
        pathname?.startsWith("/provider/marketing") ||
        pathname?.startsWith("/provider/reviews") ||
        pathname?.startsWith("/provider/schedule") ||
        pathname?.startsWith("/provider/time-blocks") ||
        pathname?.startsWith("/provider/resources") ||
        pathname?.startsWith("/provider/forms") ||
        pathname?.startsWith("/provider/orders") ||
        pathname?.startsWith("/provider/ecommerce")) return "More";
    return "";
  };

  const activeTab = getActiveTab();

  // Hide/show on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Show on scroll up
      if (lastScrollY.current > currentScrollY && !isScrollingUp.current) {
        setIsVisible(true);
        isScrollingUp.current = true;
      }

      // Hide on scroll down (after threshold)
      if (lastScrollY.current < currentScrollY && isScrollingUp.current && currentScrollY > 100) {
        setIsVisible(false);
        isScrollingUp.current = false;
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-50",
          "bg-white/95 backdrop-blur-lg border-t border-gray-200",
          "transition-transform duration-300 ease-in-out",
          "pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
          isVisible ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex items-center justify-around py-1.5 sm:py-2 px-0.5 sm:px-1 max-w-lg mx-auto">
          {primaryTabs.map((tab) => {
            const isActive = activeTab === tab.name;
            const Icon = tab.icon;
            
            return (
              <Link
                key={tab.name}
                href={tab.link}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl transition-all duration-200",
                  "touch-manipulation active:scale-95 relative",
                  // Responsive sizing
                  "py-1 px-2 sm:py-1.5 sm:px-3",
                  "min-w-[56px] sm:min-w-[64px]",
                  isActive
                    ? `${tab.activeColor} ${tab.activeBg}`
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                <Icon 
                  className={cn(
                    "transition-transform duration-200",
                    // Responsive icon sizes
                    "w-5 h-5 sm:w-6 sm:h-6",
                    isActive && "scale-110"
                  )} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span 
                  className={cn(
                    "mt-0.5 sm:mt-1 font-medium transition-colors duration-200",
                    // Responsive text sizes - hide on very small screens, show on larger
                    "text-[9px] sm:text-[10px]",
                    // Ensure text doesn't wrap
                    "whitespace-nowrap",
                    isActive ? "font-semibold" : "font-medium"
                  )}
                >
                  {tab.name}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <div className={cn(
                    "absolute -bottom-0.5 w-1 h-1 rounded-full",
                    tab.activeColor.replace("text-", "bg-")
                  )} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating Action Button (for quick add appointment) */}
      {pathname?.startsWith("/provider/calendar") && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("openAppointmentDialog"));
          }}
            className={cn(
            "md:hidden fixed z-40 shadow-lg",
            "bg-[#FF0077] text-white rounded-full",
            "transition-all duration-300 ease-in-out active:scale-95",
            "hover:bg-[#D60565] hover:shadow-xl",
            // Responsive positioning and sizing
            "right-3 sm:right-4",
            "p-2.5 sm:p-3",
            "w-11 h-11 sm:w-12 sm:h-12",
            isVisible ? "bottom-20 sm:bottom-24" : "bottom-6 sm:bottom-8"
          )}
          aria-label="Add appointment"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}

      {/* Spacer for content - responsive height */}
      <div className="md:hidden h-16 sm:h-20" />
    </>
  );
}
