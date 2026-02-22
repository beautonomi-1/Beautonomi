"use client";
import React, { useState, FormEvent, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Menu, User } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";

const LandingNavbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/search");
    }
  };

  // Handle click outside user dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target as Node)
      ) {
        setIsUserDropdownOpen(false);
      }
    };

    if (isUserDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserDropdownOpen]);

  const handleUserIconClick = () => {
    setIsUserDropdownOpen(!isUserDropdownOpen);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    setIsUserDropdownOpen(false);
  };

  return (
    <div className="sticky top-0 z-50 bg-white border-b">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        {/* Mobile Layout */}
        <div className="flex md:hidden flex-col gap-3 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex-shrink-0">
              <h1 className="text-xl font-bold text-[#FF0077]">BEAUTONOMI</h1>
            </Link>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="p-2"
                onClick={() => setIsMenuOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
            </div>
          </div>
          
          {/* Mobile Search Bar */}
          <form onSubmit={handleSearch} className="flex items-center bg-white rounded-full border border-gray-300 shadow-sm w-full">
            <Input
              type="text"
              placeholder="Search for providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-l-full px-4 py-2.5 text-sm"
            />
            <Button 
              type="submit"
              className="m-1.5 w-9 h-9 bg-[#FF0077] hover:bg-[#D60565] text-white rounded-full p-0 flex-shrink-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between py-4">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <h1 className="text-2xl font-bold text-[#FF0077]">BEAUTONOMI</h1>
          </Link>

          {/* Center: Simple Provider Search Bar */}
          <div className="flex-1 flex items-center justify-center max-w-2xl mx-8">
            <form onSubmit={handleSearch} className="flex items-center bg-white rounded-full border border-gray-300 shadow-sm hover:shadow-md transition-shadow w-full">
              <Input
                type="text"
                placeholder="Search for providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-l-full px-6 py-3 text-sm"
              />
              <Button 
                type="submit"
                className="m-2 w-10 h-10 bg-[#FF0077] hover:bg-[#D60565] text-white rounded-full p-0 flex-shrink-0"
              >
                <Search className="h-5 w-5" />
              </Button>
            </form>
          </div>

          {/* Right: Icons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/become-a-partner" className="text-sm font-normal text-gray-700 hover:text-[#FF0077] hidden lg:block">
              Become service provider
            </Link>
            {/* User Icon with Dropdown */}
            <div className="relative" ref={userDropdownRef}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="p-2" 
                type="button"
                onClick={handleUserIconClick}
              >
                <User className="h-5 w-5 text-gray-700" />
              </Button>
              
              {/* User Dropdown Menu (when not logged in) */}
              {!user && isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <ul className="text-gray-700 text-sm">
                    <li>
                      <Link
                        href="/become-a-partner"
                        className="block px-4 py-2 hover:bg-gray-100"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        Become a partner
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setLoginModalMode("login");
                          setIsLoginModalOpen(true);
                          setIsUserDropdownOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Log In
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setLoginModalMode("signup");
                          setIsLoginModalOpen(true);
                          setIsUserDropdownOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Sign Up
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {/* User Dropdown Menu (when logged in) */}
              {user && isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <ul className="text-gray-700 text-sm">
                    <li>
                      <Link
                        href="/account-settings"
                        className="block px-4 py-2 hover:bg-gray-100"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        Account Settings
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/profile"
                        className="block px-4 py-2 hover:bg-gray-100"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        Profile
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={handleSignOut}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Sign Out
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
            <LanguageSelector />
            <Button variant="ghost" size="icon" className="p-2" onClick={() => setIsMenuOpen(true)} type="button">
              <Menu className="h-5 w-5 text-gray-700" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Sheet */}
      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Link
              href="/become-a-partner"
              className="block text-base font-normal text-gray-700 hover:text-[#FF0077]"
              onClick={() => setIsMenuOpen(false)}
            >
              Become service provider
            </Link>
            {user ? (
              <>
                <Link
                  href="/account-settings"
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Account Settings
                </Link>
                <Link
                  href="/profile"
                  className="block text-base font-normal text-gray-700 hover:text-[#FF0077]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Profile
                </Link>
              </>
            ) : (
              <button
                onClick={() => {
                  setIsLoginModalOpen(true);
                  setIsMenuOpen(false);
                }}
                className="block w-full text-left text-base font-normal text-gray-700 hover:text-[#FF0077]"
              >
                Sign In
              </button>
            )}
            <Link
              href="/help"
              className="block text-base font-normal text-gray-700 hover:text-[#FF0077]"
              onClick={() => setIsMenuOpen(false)}
            >
              Help Center
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <LoginModal 
        open={isLoginModalOpen} 
        setOpen={setIsLoginModalOpen}
        initialMode={loginModalMode}
      />
    </div>
  );
};

export default LandingNavbar;
