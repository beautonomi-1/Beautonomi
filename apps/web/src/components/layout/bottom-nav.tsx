"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Search, User, Calendar, MessageSquare, Home } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";

type TabId = "home" | "search" | "bookings" | "chats" | "wishlists" | "login";

type Tab = {
  id: TabId;
  icon: typeof Home;
  link: string;
  isLink: boolean;
};

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const loggedInTabs: Tab[] = [
    { id: "home", icon: Home, link: "/", isLink: true },
    { id: "search", icon: Search, link: "/search", isLink: true },
    { id: "bookings", icon: Calendar, link: "/bookings", isLink: true },
    { id: "chats", icon: MessageSquare, link: "/inbox", isLink: true },
    { id: "wishlists", icon: Heart, link: "/account-settings/wishlists", isLink: true },
  ];

  const guestTabs: Tab[] = [
    { id: "home", icon: Home, link: "/", isLink: true },
    { id: "search", icon: Search, link: "/search", isLink: true },
    { id: "wishlists", icon: Heart, link: "/account-settings/wishlists", isLink: true },
    { id: "login", icon: User, link: "#", isLink: false },
  ];

  // SSR has no session in this client tree; first paint must match to avoid hydration errors.
  // After mount + auth settle, switch to signed-in tabs when applicable.
  const showSignedInNav = hasMounted && !isLoading && Boolean(user);
  const tabs = showSignedInNav ? loggedInTabs : guestTabs;

  const getActiveTab = (): TabId | "" => {
    if (pathname === "/") return "home";
    if (pathname === "/search") return "search";
    if (pathname?.startsWith("/explore")) return "";
    if (pathname?.startsWith("/account-settings/wishlists")) return "wishlists";
    if (pathname?.startsWith("/bookings") || pathname?.startsWith("/account-settings/bookings")) return "bookings";
    if (pathname?.startsWith("/inbox") || pathname?.startsWith("/account-settings/messages")) return "chats";
    if (showSignedInNav && pathname?.startsWith("/account-settings")) return "";
    if (!showSignedInNav && pathname?.startsWith("/account-settings")) return "login";
    return "";
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab: Tab, e: React.MouseEvent) => {
    if (!tab.isLink) {
      e.preventDefault();
      setIsLoginModalOpen(true);
    }
  };

  return (
    <div className="block md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg pb-safe w-full overflow-x-hidden">
      <nav className="flex items-stretch justify-between py-2 px-1 sm:px-2 pb-1 w-full max-w-full overflow-x-hidden gap-0.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const label = t(`web.layout.bottomNav.${tab.id}`);
          const itemClass = `flex flex-col items-center justify-center py-1.5 px-0.5 sm:px-2 flex-1 min-w-0 min-h-[48px] rounded-lg transition-colors touch-manipulation select-none ${
            active ? "text-[#FF0077] bg-pink-50" : "text-gray-600 hover:text-[#FF0077] active:text-[#FF0077]"
          }`;

          if (tab.isLink) {
            return (
              <Link
                key={tab.id}
                href={tab.link}
                className={itemClass}
                aria-current={active ? "page" : undefined}
              >
                <tab.icon className="w-5 h-5 flex-shrink-0 pointer-events-none" aria-hidden />
                <span className="text-[10px] leading-tight mt-0.5 font-medium w-full text-center pointer-events-none whitespace-nowrap overflow-hidden">
                  {label}
                </span>
              </Link>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => handleTabClick(tab, e)}
              className={`${itemClass} bg-transparent border-0 p-0 appearance-none`}
            >
              <tab.icon className="w-5 h-5 flex-shrink-0 pointer-events-none" aria-hidden />
              <span className="text-[10px] leading-tight mt-0.5 font-medium w-full text-center pointer-events-none whitespace-nowrap overflow-hidden">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
      />
    </div>
  );
}
