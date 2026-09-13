"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Menu, User, Settings } from "lucide-react";
import PlatformLogo from "../platform/PlatformLogo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import LoginModal from "@/components/global/login-modal";
import { CustomerNotificationsDropdown } from "@/components/customer/CustomerNotificationsDropdown";

const AccountSettingsNavbar: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const prefix = "web.layout.accountSettingsNavbar";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component only renders Sheet after hydration to avoid ID mismatch
  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      // AuthProvider uses a hard navigation to `/` so the account-settings layout cannot "win" a soft refresh race.
    } catch (error) {
      console.error("Error signing out:", error);
      if (typeof window !== "undefined") window.location.assign("/");
      else router.replace("/");
    }
  };

  return (
    <div className="sticky top-0 z-50 bg-white border-b">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <PlatformLogo alt={t(`${prefix}.logoAlt`)} className="h-10 w-auto" />
          </Link>

          {/* Mobile search is in the main bottom nav; keep header light here */}

          {/* Right: Profile & Menu */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Desktop: Account Settings Link */}
            <Link
              href="/account-settings"
              className="hidden md:flex items-center gap-2 text-sm font-normal text-gray-700 hover:text-primary transition-colors"
            >
              <Settings className="h-5 w-5" />
              <span>{t(`${prefix}.account`)}</span>
            </Link>

            {/* Notifications Bell - Only show when user is logged in */}
            {user && <CustomerNotificationsDropdown />}

            {/* Profile: go straight to account (fast hub); desktop sign out + saved */}
            {user ? (
              <>
                <Link
                  href="/account-settings"
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label={t(`${prefix}.accountProfileAria`)}
                >
                  <User className="h-6 w-6 text-gray-700" />
                </Link>
                <Link
                  href="/explore/saved"
                  className="hidden md:inline-flex text-sm text-gray-600 hover:text-gray-900 px-1"
                >
                  {t(`${prefix}.saved`)}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hidden md:inline-flex text-sm text-gray-600 hover:text-gray-900 px-1"
                >
                  {t("common.signOut")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label={t(`${prefix}.signInAria`)}
              >
                <User className="h-6 w-6 text-gray-700" />
              </button>
            )}

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
                <SheetContent side="end" className="w-80 bg-white">
                  <SheetHeader>
                    <SheetTitle>{t("web.layout.landingNavbar.menu")}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-2">
                    <Link
                      href="/explore"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t("web.layout.explore")}
                    </Link>
                    {user && (
                      <Link
                        href="/explore/saved"
                        className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {t(`${prefix}.savedPosts`)}
                      </Link>
                    )}
                    <Link
                      href="/search"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t(`${prefix}.searchProviders`)}
                    </Link>
                    <Link
                      href="/account-settings"
                      className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t(`${prefix}.accountSettings`)}
                    </Link>
                    {user && (
                      <>
                        <button
                          onClick={() => {
                            handleSignOut();
                            setIsMenuOpen(false);
                          }}
                          className="block w-full text-start px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                        >
                          {t("web.layout.header.signOut")}
                        </button>
                      </>
                    )}
                    {!user && (
                      <button
                        onClick={() => {
                          setIsLoginModalOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="block w-full text-start px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
                      >
                        {t("web.layout.landingNavbar.signIn")}
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

      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
      />
    </div>
  );
};

export default AccountSettingsNavbar;
