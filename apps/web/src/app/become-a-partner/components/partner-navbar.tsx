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

export default function PartnerNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const router = useRouter();
  const { user, role, isLoading } = useAuth();

  const handleTryItNow = () => {
    if (isLoading) return;
    
    if (!user) {
      setLoginModalMode("login");
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
    setIsMenuOpen(false);
  };

  const handleBookDemo = () => {
    if (isLoading) return;
    
    if (!user) {
      setLoginModalMode("login");
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      // Already a provider - could redirect to a demo booking page or contact form
      router.push("/provider/dashboard");
    } else {
      // Logged in but not a provider - go to onboarding
      router.push("/provider/onboarding");
    }
    setIsMenuOpen(false);
  };

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
      {/* Top Banner */}
      <div className="bg-[#1a1a2e] text-white text-center py-2 text-sm">
        <p>
          Introducing Beautonomi Connect: Phone calls, text messages, and web chats.{" "}
          <Link href="/resources" className="underline hover:text-pink-300">
            Learn more
          </Link>
        </p>
      </div>

      {/* Main Navbar */}
      <nav className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile Layout */}
          <div className="flex md:hidden items-center justify-between py-3">
            <Link href="/" className="flex-shrink-0">
              <h1 className="text-xl font-bold text-[#FF0077]">BEAUTONOMI</h1>
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
                <div className="w-8 h-8 bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-lg flex items-center justify-center">
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
                className="text-sm font-medium text-gray-700 hover:text-[#FF0077] transition-colors whitespace-nowrap"
              >
                Pricing
              </Link>
              <Link
                href="/why-beautonomi"
                className="text-sm font-medium text-gray-700 hover:text-[#FF0077] transition-colors whitespace-nowrap hidden lg:block"
              >
                Why Beautonomi
              </Link>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={handleLoginClick}
                className="text-sm font-medium text-gray-700 hover:text-[#FF0077] transition-colors hidden xl:block whitespace-nowrap"
              >
                Log in
              </button>
              <Button
                variant="outline"
                onClick={handleBookDemo}
                className="border-2 border-[#FF0077] text-[#FF0077] hover:bg-[#FF0077] hover:text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all hidden md:flex whitespace-nowrap"
              >
                Book a demo
              </Button>
              <Button
                onClick={handleTryItNow}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all whitespace-nowrap"
              >
                Try it now
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
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077] py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Become service provider
                </Link>
                <Link
                  href="/pricing"
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077] py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  href="/why-beautonomi"
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077] py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Why Beautonomi
                </Link>
              </div>
              <div className="pt-4 border-t space-y-2">
                <button
                  onClick={handleSignUpClick}
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077] py-2 w-full text-left"
                >
                  Sign up
                </button>
                <button
                  onClick={handleLoginClick}
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077] py-2 w-full text-left"
                >
                  Log in
                </button>
                <Button
                  variant="outline"
                  className="w-full border-2 border-[#FF0077] text-[#FF0077] hover:bg-[#FF0077] hover:text-white mt-2"
                  onClick={handleBookDemo}
                >
                  Book a demo
                </Button>
                <Button
                  className="w-full bg-[#FF0077] hover:bg-[#D60565] text-white mt-2"
                  onClick={handleTryItNow}
                >
                  Try it now
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
