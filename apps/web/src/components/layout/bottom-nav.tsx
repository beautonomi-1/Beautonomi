"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Search, User, Calendar, MessageSquare, Home } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";

export default function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const lastScrollY = useRef(0);
  const isScrollingUp = useRef(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const loggedInTabs = [
    { name: "Home", icon: Home, link: "/", isLink: true },
    { name: "Search", icon: Search, link: "/search", isLink: true },
    { name: "Bookings", icon: Calendar, link: "/bookings", isLink: true },
    { name: "Chats", icon: MessageSquare, link: "/inbox", isLink: true },
    { name: "Profile", icon: User, link: "/profile", isLink: true },
  ] as const;

  const guestTabs = [
    { name: "Home", icon: Home, link: "/", isLink: true },
    { name: "Search", icon: Search, link: "/search", isLink: true },
    { name: "Wishlists", icon: Heart, link: "/account-settings/wishlists", isLink: true },
    { name: "Log in", icon: User, link: "#", isLink: false },
  ] as const;

  // SSR has no session in this client tree; first paint must match to avoid hydration errors.
  // After mount + auth settle, switch to signed-in tabs when applicable.
  const showSignedInNav = hasMounted && !isLoading && Boolean(user);
  const tabs = showSignedInNav ? loggedInTabs : guestTabs;

  // Determine active tab based on current pathname
  const getActiveTab = () => {
    if (pathname === "/") return "Home";
    if (pathname === "/search") return "Search";
    if (pathname?.startsWith("/explore")) return "";
    if (pathname?.startsWith("/account-settings/wishlists")) return "Wishlists";
    // Bookings: check both /bookings and /account-settings/bookings
    if (pathname?.startsWith("/bookings") || pathname?.startsWith("/account-settings/bookings")) return "Bookings";
    // Chats: check both /inbox and /account-settings/messages
    if (pathname?.startsWith("/inbox") || pathname?.startsWith("/account-settings/messages")) return "Chats";
    if (showSignedInNav && pathname?.startsWith("/profile")) return "Profile";
    // Don't show Profile as active for all account settings, only for specific pages
    if (
      showSignedInNav &&
      pathname?.startsWith("/account-settings") &&
      !pathname?.startsWith("/account-settings/bookings") &&
      !pathname?.startsWith("/account-settings/messages") &&
      !pathname?.startsWith("/account-settings/wishlists")
    ) {
      return "Profile";
    }
    if (!showSignedInNav && pathname?.startsWith("/account-settings")) return "Log in";
    return "";
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab: typeof tabs[0], e: React.MouseEvent) => {
    if (!tab.isLink) {
      e.preventDefault();
      setIsLoginModalOpen(true);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // If scrolling up and last Y was greater than current Y, show navbar
      if (lastScrollY.current > currentScrollY && !isScrollingUp.current) {
        setIsVisible(true);
        isScrollingUp.current = true;
      }

      // If scrolling down and last Y was less than current Y, hide navbar
      if (lastScrollY.current < currentScrollY && isScrollingUp.current) {
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
    <div
      className={`block md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 transition-transform duration-300 ease-in-out shadow-lg pb-safe w-full overflow-x-hidden ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <nav className="flex items-stretch justify-between py-2 px-1 sm:px-2 pb-1 w-full max-w-full overflow-x-hidden gap-0.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.name;
          const itemClass = `flex flex-col items-center justify-center py-2 px-1 sm:px-2 flex-1 min-w-0 min-h-[48px] rounded-lg transition-colors touch-manipulation select-none ${
            active ? "text-[#FF0077] bg-pink-50" : "text-gray-600 hover:text-[#FF0077] active:text-[#FF0077]"
          }`;

          if (tab.isLink) {
            return (
              <Link
                key={tab.name}
                href={tab.link}
                className={itemClass}
                aria-current={active ? "page" : undefined}
              >
                <tab.icon className="w-5 h-5 flex-shrink-0 pointer-events-none" aria-hidden />
                <span className="text-[10px] mt-0.5 font-medium truncate w-full text-center pointer-events-none">
                  {tab.name}
                </span>
              </Link>
            );
          }

          return (
            <button
              key={tab.name}
              type="button"
              onClick={(e) => handleTabClick(tab, e)}
              className={`${itemClass} bg-transparent border-0 p-0 appearance-none`}
            >
              <tab.icon className="w-5 h-5 flex-shrink-0 pointer-events-none" aria-hidden />
              <span className="text-[10px] mt-0.5 font-medium truncate w-full text-center pointer-events-none">
                {tab.name}
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
