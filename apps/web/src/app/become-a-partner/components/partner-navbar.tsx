"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import SolutionsDropdown from "./solutions-dropdown";
import FeaturesDropdown from "./features-dropdown";
import { usePageContent } from "@/hooks/usePageContent";

const TOP_BANNER_ENABLED_VALUES = new Set(["true", "1", "yes"]);

export default function PartnerNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const router = useRouter();
  useAuth();
  const { getSectionContent } = usePageContent("become-a-partner");
  const topBannerEnabledRaw = getSectionContent("top_banner_enabled")?.trim().toLowerCase();
  const topBannerEnabled = topBannerEnabledRaw ? TOP_BANNER_ENABLED_VALUES.has(topBannerEnabledRaw) : false;
  const topBannerContent = getSectionContent("top_banner_content")?.trim();
  const topBannerLink = getSectionContent("top_banner_link")?.trim();
  const defaultBannerText = "Introducing Beautonomi Connect: Phone calls, text messages, and web chats.";
  const defaultBannerLink = "/resources";
  const bannerText = topBannerContent || defaultBannerText;
  const bannerLink = topBannerLink || defaultBannerLink;

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setLoginModalMode("login");
    setIsLoginModalOpen(true);
    setIsMenuOpen(false);
  };

  const handleSignUpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMenuOpen(false);
    // Navigate to signup page with provider type
    router.push("/signup?type=provider");
  };

  return (
    <>
      {/* Top notification strip – shown only when enabled in CMS (top_banner_enabled = true/1/yes) */}
      {topBannerEnabled && (
        <div className="bg-[#1a1a2e] text-white text-center py-2 text-sm">
          <p>
            {bannerText}{" "}
            <Link href={bannerLink} className="underline hover:text-pink-300">
              Learn more
            </Link>
          </p>
        </div>
      )}

      {/* Main Navbar */}
      <nav className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile Layout */}
          <div className="flex md:hidden items-center justify-between py-3">
            <Link href="/" className="flex-shrink-0">
              <h1 className="text-xl font-bold text-primary">BEAUTONOMI</h1>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="p-2"
              onClick={() => setIsMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between py-4">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-hover rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">B</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">beautonomi</h1>
              </div>
            </Link>

            {/* Center Navigation */}
            <div className="flex-1 flex items-center justify-center gap-4 lg:gap-8 mx-4 lg:mx-8">
              <SolutionsDropdown />
              <FeaturesDropdown />
              <Link
                href="/pricing"
                className="text-sm font-medium text-gray-700 hover:text-primary transition-colors whitespace-nowrap"
              >
                Pricing
              </Link>
              <Link
                href="/why-beautonomi"
                className="text-sm font-medium text-gray-700 hover:text-primary transition-colors whitespace-nowrap hidden lg:block"
              >
                Why Beautonomi
              </Link>
            </div>

            {/* Right Actions: Login as Partner + Sign up (no "Book a demo" / "Try it now") */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Button
                variant="outline"
                onClick={handleLoginClick}
                className="border-2 border-primary text-primary hover:bg-primary hover:text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all hidden md:flex whitespace-nowrap"
              >
                Login as Partner
              </Button>
              <Button
                onClick={handleSignUpClick}
                className="bg-primary hover:bg-primary-hover text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all whitespace-nowrap"
              >
                Sign up
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Sheet */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetContent side="right" className="w-80">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                  Navigation
                </p>
                <Link
                  href="/become-a-partner"
                  className="block text-base font-normal text-gray-700 hover:text-primary py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Become service provider
                </Link>
                <Link
                  href="/pricing"
                  className="block text-base font-normal text-gray-700 hover:text-primary py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  href="/why-beautonomi"
                  className="block text-base font-normal text-gray-700 hover:text-primary py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Why Beautonomi
                </Link>
              </div>
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                  Try it now
                </p>
                <Button
                  variant="outline"
                  className="w-full border-2 border-primary text-primary hover:bg-primary hover:text-white"
                  onClick={handleLoginClick}
                >
                  Login as Partner
                </Button>
                <Button
                  className="w-full bg-primary hover:bg-primary-hover text-white"
                  onClick={handleSignUpClick}
                >
                  Sign up
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
      <LoginModal 
        open={isLoginModalOpen} 
        setOpen={setIsLoginModalOpen}
        initialMode={loginModalMode}
        redirectContext="provider"
      />
    </>
  );
}
