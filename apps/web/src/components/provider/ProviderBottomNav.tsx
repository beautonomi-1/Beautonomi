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
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import { useTranslation } from "@beautonomi/i18n";

const PRIMARY_TABS = [
  { id: "home", nameKey: "web.layout.bottomNav.home", icon: LayoutDashboard, link: "/provider/dashboard" },
  { id: "calendar", nameKey: "web.provider.topbar.mobileTitles.calendar", icon: Calendar, link: "/provider/calendar" },
  { id: "clients", nameKey: "web.provider.topbar.mobileTitles.clients", icon: Users, link: "/provider/clients" },
  { id: "chats", nameKey: "web.layout.bottomNav.chats", icon: MessageSquare, link: "/provider/messaging" },
  { id: "more", nameKey: "web.provider.topbar.mobileTitles.more", icon: Grid3x3, link: "/provider/more" },
] as const;

export function ProviderBottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { branding } = usePlatformSettings();
  const primaryColor = branding?.primary_color || "#FF0077";
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const isScrollingUp = useRef(false);

  // Determine active tab based on current pathname
  const getActiveTab = () => {
    if (pathname === "/provider/dashboard") return "home";
    if (pathname?.startsWith("/provider/calendar") || 
        pathname?.startsWith("/provider/appointments") ||
        pathname?.startsWith("/provider/bookings")) return "calendar";
    if (pathname?.startsWith("/provider/clients")) return "clients";
    if (pathname?.startsWith("/provider/messaging") || 
        pathname?.startsWith("/provider/chats")) return "chats";
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
        pathname?.startsWith("/provider/ecommerce") ||
        pathname?.startsWith("/provider/finance") ||
        pathname?.startsWith("/provider/analytics") ||
        pathname?.startsWith("/provider/explore") ||
        pathname?.startsWith("/provider/packages") ||
        pathname?.startsWith("/provider/waiting-room") ||
        pathname?.startsWith("/provider/waitlist") ||
        pathname?.startsWith("/provider/gamification") ||
        pathname?.startsWith("/provider/subscription") ||
        pathname?.startsWith("/provider/payouts") ||
        pathname?.startsWith("/provider/sales") ||
        pathname?.startsWith("/provider/account") ||
        pathname?.startsWith("/provider/notifications") ||
        pathname?.startsWith("/provider/recurring-appointments") ||
        pathname?.startsWith("/provider/express-booking") ||
        pathname?.startsWith("/provider/front-desk")) return "more";
    return "";
  };

  const activeTab = getActiveTab();

  useEffect(() => {
    let rafId: number | null = null;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;

        if (lastScrollY.current > currentScrollY && !isScrollingUp.current) {
          setIsVisible(true);
          isScrollingUp.current = true;
        }

        if (lastScrollY.current < currentScrollY && isScrollingUp.current && currentScrollY > 100) {
          setIsVisible(false);
          isScrollingUp.current = false;
        }

        lastScrollY.current = currentScrollY;
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav
        aria-label={t("web.provider.bottomNav.ariaLabel")}
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-50",
          "bg-white/95 backdrop-blur-lg border-t border-gray-200",
          "transition-transform duration-300 ease-in-out",
          "pb-safe",
          isVisible ? "translate-y-0" : "translate-y-full"
        )}
        style={{ boxShadow: `0 -4px 16px color-mix(in srgb, ${primaryColor} 14%, transparent)` }}
      >
        <div className="flex items-center justify-around px-0.5 sm:px-1 max-w-lg mx-auto">
          {PRIMARY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            
            return (
              <Link
                key={tab.id}
                href={tab.link}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl transition-all duration-200",
                  "touch-manipulation active:scale-95 relative select-none",
                  "py-1.5 px-2 sm:py-2 sm:px-3",
                  "min-w-[56px] sm:min-w-[64px] min-h-[48px]",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                <Icon 
                  className={cn(
                    "pointer-events-none transition-transform duration-200",
                    "w-5 h-5 sm:w-6 sm:h-6",
                    isActive && "scale-110"
                  )} 
                  strokeWidth={isActive ? 2.5 : 2}
                  aria-hidden
                />
                <span 
                  className={cn(
                    "pointer-events-none mt-0.5 font-medium transition-colors duration-200",
                    "text-[10px] sm:text-[11px]",
                    "whitespace-nowrap",
                    isActive ? "font-semibold" : "font-medium"
                  )}
                >
                  {t(tab.nameKey)}
                </span>
                {isActive && (
                  <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary" />
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
            "bg-primary text-white rounded-full",
            "transition-all duration-300 ease-in-out active:scale-95",
            "hover:bg-primary-hover hover:shadow-xl",
            // Responsive positioning and sizing
            "end-3 sm:end-4",
            "p-2.5 sm:p-3",
            "w-11 h-11 sm:w-12 sm:h-12",
            isVisible ? "bottom-20 sm:bottom-24" : "bottom-6 sm:bottom-8"
          )}
          aria-label={t("web.provider.calendarMobile.addAppointment")}
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}

      {/* Spacer: bottom nav + iOS home indicator */}
      <div className="md:hidden shrink-0 h-[calc(4.5rem+env(safe-area-inset-bottom,0px))]" aria-hidden />
    </>
  );
}
