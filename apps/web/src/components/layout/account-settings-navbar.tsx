"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, User, Settings } from "lucide-react";
import PlatformLogo from "../platform/PlatformLogo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { CustomerNotificationsDropdown } from "@/components/customer/CustomerNotificationsDropdown";

const AccountSettingsNavbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Ensure component only renders Sheet after hydration to avoid ID mismatch
  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setIsPopupVisible(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleProfileClick = () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    setIsPopupVisible(!isPopupVisible);
  };

  const handleSignOut = async () => {
    try {
      setIsPopupVisible(false);
      await signOut();
      // signOut already handles redirect, but ensure we navigate if needed
      if (pathname !== "/") {
        router.push("/");
      }
      router.refresh(); // Refresh to clear any cached data
    } catch (error) {
      console.error("Error signing out:", error);
      // Even if there's an error, try to redirect and clear local state
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="sticky top-0 z-50 bg-white border-b">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <PlatformLogo alt="Beautonomi Logo" className="h-10 w-auto" />
          </Link>

          {/* Center: Simple Search (only on mobile) */}
          <div className="flex-1 flex items-center justify-center max-w-md mx-4 md:hidden">
            <Link
              href="/search"
              className="flex items-center bg-white rounded-full border border-gray-300 shadow-sm hover:shadow-md transition-shadow w-full px-4 py-2"
            >
              <Search className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Search providers...</span>
            </Link>
          </div>

          {/* Right: Profile & Menu */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Desktop: Account Settings Link */}
            <Link
              href="/account-settings"
              className="hidden md:flex items-center gap-2 text-sm font-normal text-gray-700 hover:text-[#FF0077] transition-colors"
            >
              <Settings className="h-5 w-5" />
              <span>Account</span>
            </Link>

            {/* Notifications Bell - Only show when user is logged in */}
            {user && <CustomerNotificationsDropdown />}

            {/* Profile Icon */}
            <div className="relative" ref={popupRef}>
              <button
                onClick={handleProfileClick}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <User className="h-6 w-6 text-gray-700" />
              </button>

              {/* Profile Dropdown */}
              {isPopupVisible && user && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/account-settings"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setIsPopupVisible(false)}
                  >
                    Account Settings
                  </Link>
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setIsPopupVisible(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/explore/saved"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setIsPopupVisible(false)}
                  >
                    Saved Posts
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu - Only render after mount to avoid hydration mismatch */}
            {isMounted && (
              <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    suppressHydrationWarning
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 bg-white">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-2">
                    <Link
                      href="/explore"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Explore
                    </Link>
                    {user && (
                      <Link
                        href="/explore/saved"
                        className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Saved Posts
                      </Link>
                    )}
                    <Link
                      href="/search"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Search Providers
                    </Link>
                    <Link
                      href="/account-settings"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Account Settings
                    </Link>
                    {user && (
                      <>
                        <Link
                          href="/profile"
                          className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          Profile
                        </Link>
                        <button
                          onClick={() => {
                            handleSignOut();
                            setIsMenuOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                        >
                          Sign Out
                        </button>
                      </>
                    )}
                    {!user && (
                      <button
                        onClick={() => {
                          setIsLoginModalOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      >
                        Sign In
                      </button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            {/* Fallback button for SSR - will be replaced by Sheet after mount */}
            {!isMounted && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setIsMenuOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
};

export default AccountSettingsNavbar;
