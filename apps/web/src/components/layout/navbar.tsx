"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PlatformLogo from "../platform/PlatformLogo";
import profile from "../../../public/images/filled-profile-icon.svg";
import sidebar from "../../../public/images/sidebar-icon.svg";
import SearchBar from "../global/search-bar";
import FilterSlider from "@/app/home/components/filter-slider";
import { Menu, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import MobileSearchBar from "./mobile-search-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { PreferencesTrigger } from "@/components/global/PreferencesTrigger";
import { useOpenGlobalPreferences } from "@/components/global/GlobalPreferencesDialog";
import LoginModal from "../global/login-modal";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const openPreferences = useOpenGlobalPreferences();
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, isLoading: authLoading } = useAuth();
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const [isSticky, setIsSticky] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollY = useRef<number>(0);
  const throttleTimeout = useRef<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const [isFilterSliderSticky, setIsFilterSliderSticky] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  // Prevent hydration mismatch by only rendering Radix components after mount
  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

  // Cart count for authenticated users; refresh on cart-updated event (e.g. after add-to-cart)
  const refreshCartCount = useCallback(() => {
    if (authLoading || !user || !session) return;
    fetch("/api/me/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.data?.items) return;
        const total = json.data.items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity ?? 1), 0);
        setCartCount(total);
      })
      .catch(() => {});
  }, [authLoading, session, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !session) {
      setCartCount(0);
      return;
    }
    let cancelled = false;
    fetch("/api/me/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data?.items) return;
        const total = json.data.items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity ?? 1), 0);
        setCartCount(total);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authLoading, session, user]);

  useEffect(() => {
    const handler = () => refreshCartCount();
    window.addEventListener("beautonomi:cart-updated", handler);
    return () => window.removeEventListener("beautonomi:cart-updated", handler);
  }, [refreshCartCount]);

  const handleProfileClick = () => {
    setIsPopupVisible(!isPopupVisible);
  };

  const handleOutsideClick = useCallback(
    (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setIsPopupVisible(false);
      }
      if (
        isExpanded &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    },
    [isExpanded]
  );

  const handleScroll = useCallback(() => {
    if (throttleTimeout.current) return;

    throttleTimeout.current = setTimeout(() => {
      const currentScrollY = window.scrollY;
      setIsSticky(currentScrollY > 0);
      setIsFilterSliderSticky(currentScrollY > 100);
      lastScrollY.current = currentScrollY;

      throttleTimeout.current = null;
    }, 200);
  }, []);

  const handleMinimizedSearchClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsExpanded(true);
  };

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    },
    [isExpanded]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScroll);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("keydown", handleKeyDown);
      if (throttleTimeout.current) clearTimeout(throttleTimeout.current);
    };
  }, [handleOutsideClick, handleScroll, handleKeyDown]);

  const handleSearchSubmit = (query: string) => {
    setSearchQuery(query);
    setIsExpanded(false);
  };

  const handleOpenLanguageModal = () => {
    openPreferences({ surface: "navbar" });
    setIsSideMenuOpen(false);
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white w-full overflow-x-hidden max-w-full">
        <div className=" flex lg:hidden items-center justify-between px-4 pt-4 w-full max-w-full overflow-x-hidden">
          <div className="mx-auto  w-44">
            <Link href="/" className="">
              <PlatformLogo alt={t("web.layout.navbar.logoAlt")} className="w-44" />
            </Link>
          </div>
          <div className="">
            {isMounted ? (
              <>
                {/* Show "{t("web.layout.navbar.becomePartner")}" menu for unauthenticated users */}
                {!user && !authLoading ? (
                  <Sheet open={isSideMenuOpen} onOpenChange={setIsSideMenuOpen}>
                    <SheetTrigger asChild>
                      <button 
                        type="button" 
                        aria-label={t("web.a11y.openMenu")}
                        className="flex items-center justify-center"
                      >
                        <Menu className="h-6 w-6 mt-2 sm:mt-5 text-gray-700" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="end" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto bg-white">
                      <SheetHeader>
                        <SheetTitle className="text-center text-lg font-normal">
                          {t("web.layout.navbar.becomePartner")}
                        </SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-4">
                        <Button 
                          variant="outline" 
                          className="w-full bg-white text-black border border-gray-300 hover:bg-gray-50" 
                          size="lg"
                          onClick={() => {
                            setLoginModalMode("login");
                            setIsLoginModalOpen(true);
                            setIsSideMenuOpen(false);
                          }}
                        >
                          {t("web.layout.navbar.logIn")}
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="w-full bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white" 
                          size="lg"
                          onClick={() => {
                            setIsSideMenuOpen(false);
                            router.push("/signup");
                          }}
                        >
                          {t("web.layout.navbar.signUp")}
                        </Button>
                      </div>
                      <div className="mt-6 px-2">
                        <PreferencesTrigger
                          onClick={handleOpenLanguageModal}
                          className="w-full justify-start rounded-xl px-2"
                          compactOnMobile={false}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Sheet open={isSideMenuOpen} onOpenChange={setIsSideMenuOpen}>
                    <SheetTrigger asChild>
                      <button 
                        type="button" 
                        aria-label={t("web.a11y.openMenu")}
                        className="flex items-center justify-center"
                      >
                        <Menu className="h-6 w-6 mt-2 sm:mt-5 text-gray-700" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="end" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto bg-white">
                      <SheetHeader>
                        <SheetTitle>{t("web.layout.navbar.menu")}</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6">
                        <ul className="text-secondary text-base font-light space-y-4">
                          <li>
                            <Link href="/shop" className="flex items-center gap-2">
                              <ShoppingBag className="h-4 w-4" /> {t("web.layout.navbar.shopProducts")}
                            </Link>
                          </li>
                          <li>
                            <Link href="/cart" className="flex items-center gap-2">
                              <ShoppingCart className="h-4 w-4" /> {t("web.layout.navbar.myCart")}{cartCount > 0 ? ` (${cartCount})` : ""}
                            </Link>
                          </li>
                          <li>
                            <Link href="/become-a-partner">{t("web.layout.navbar.becomePartner")}</Link>
                          </li>
                          <li className="border-b pb-4">
                            <Link href="/">{t("web.layout.navbar.resources")}</Link>
                          </li>
                        </ul>
                        <div className="mt-6 space-y-4 mb-3">
                          <Button variant="outline" className="w-full" size="lg">
                            {t("web.layout.navbar.logIn")}
                          </Button>
                          <Button 
                            variant="secondary" 
                            className="w-full bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white" 
                            size="lg"
                          >
                            {t("web.layout.navbar.signUp")}
                          </Button>
                        </div>
                        <div className="px-2">
                          <PreferencesTrigger
                            onClick={handleOpenLanguageModal}
                            className="w-full justify-start rounded-xl px-2"
                            compactOnMobile={false}
                          />
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </>
            ) : (
              <button 
                type="button" 
                aria-label={t("web.a11y.openMenu")}
                onClick={() => setIsSideMenuOpen(true)}
              >
                <Menu className="h-6 w-6 mt-2 sm:mt-5 text-gray-700" />
              </button>
            )}
          </div>
        </div>

        <div className="border-b hidden lg:block w-full overflow-x-hidden">
          <div className="max-w-[2340px] mx-auto px-4 sm:px-6 lg:px-20 w-full max-w-full overflow-x-hidden">
            <div
              className={`flex justify-between items-center transition-all duration-300 ease-out ${
                isSticky && !isExpanded ? "h-20" : "h-40"
              }`}
            >
              <div
                className={`flex items-center gap-2 absolute start-8 transition-all duration-300 z-50 ${
                  isSticky && !isExpanded ? "top-2" : "top-4"
                }`}
              >
                <Link href="/">
                  <PlatformLogo alt={t("web.layout.navbar.logoAlt")} className="h-12 w-auto" />
                </Link>
              </div>
              <div
                className={`w-full flex justify-center items-center relative transition-all duration-300 z-50 -mt-16 ${
                  isSticky && !isExpanded
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100"
                }`}
              >
                {isMounted ? (
                  <Tabs defaultValue="booking">
                    <TabsList className="bg-transparent">
                      <TabsTrigger
                        className="bg-transparent data-[state=active]:shadow-none"
                        value="booking"
                      >
                        {t("web.layout.navbar.bookings")}
                      </TabsTrigger>
                      <TabsTrigger
                        className="bg-transparent data-[state=active]:shadow-none"
                        value="showcase"
                      >
                        {t("web.layout.navbar.showCase")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="booking">
                    <div className="w-full  flex justify-center items-center relative h-full top-8">
                      <div
                        ref={searchContainerRef}
                        className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2 search-container
                ${
                  isExpanded || !isSticky
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                        style={{
                          top: isSticky && !isExpanded ? "-100%" : "50%",
                          transform: `translate(-50%, ${
                            isSticky && !isExpanded ? "0" : "-50%"
                          })`,
                        }}
                      >
                        <SearchBar
                          searchQuery={searchQuery}
                          onSearchSubmit={handleSearchSubmit}
                        />
                      </div>
                      <div
                        className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2
                ${
                  isSticky && !isExpanded
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                        style={{
                          top: "50%",
                          transform: `translate(-50%, -50%) ${
                            isSticky && !isExpanded
                              ? "translateY(0)"
                              : "translateY(100%)"
                          }`,
                        }}
                        onClick={handleMinimizedSearchClick}
                      >
                        <div className="bg-white transition-all hover:shadow-lg cursor-pointer rounded-full searchShadow border border-[#DDDDDD] flex items-center">
                          <span className="text-secondary text-sm font-medium ps-8 pe-4 py-3">
                            {t("web.layout.navbar.serviceNeeded")}
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-secondary text-sm font-medium py-3 px-4">
                            {t("web.layout.navbar.anyTime")}
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-[#767A7C] text-sm font-light py-3 ps-4 pe-4">
                            {t("web.layout.navbar.search")}
                          </span>
                          <Link href="/search">
                            <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 me-2 rounded-full">
                              <Search className="text-white w-6 h-6" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                    </TabsContent>
                    <TabsContent value="showcase">
                    <div className="w-full  flex justify-center items-center relative h-full top-8">
                      <div
                        ref={searchContainerRef}
                        className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2 search-container
                ${
                  isExpanded || !isSticky
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                        style={{
                          top: isSticky && !isExpanded ? "-100%" : "50%",
                          transform: `translate(-50%, ${
                            isSticky && !isExpanded ? "0" : "-50%"
                          })`,
                        }}
                      >
                        <SearchBar
                          searchQuery={searchQuery}
                          onSearchSubmit={handleSearchSubmit}
                        />
                      </div>
                      <div
                        className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2
                ${
                  isSticky && !isExpanded
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                        style={{
                          top: "50%",
                          transform: `translate(-50%, -50%) ${
                            isSticky && !isExpanded
                              ? "translateY(0)"
                              : "translateY(100%)"
                          }`,
                        }}
                        onClick={handleMinimizedSearchClick}
                      >
                        <div className="bg-white transition-all hover:shadow-lg cursor-pointer rounded-full searchShadow border border-[#DDDDDD] flex items-center">
                          <span className="text-secondary font-medium ps-8 pe-4 py-3">
                            {t("web.layout.navbar.serviceNeeded")}
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-secondary font-medium py-3 px-4">
                            {t("web.layout.navbar.anyTime")}
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-[#767A7C] font-light py-3 ps-4 pe-4">
                            {t("web.layout.navbar.search")}
                          </span>
                          <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 me-2 rounded-full">
                            <Search className="text-white w-6 h-6" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </div>
              <div
                className={`flex items-center gap-3 absolute end-8 transition-all duration-300 z-50 ${
                  isSticky && !isExpanded ? "top-4" : "top-6"
                }`}
              >
                <Link
                  href="/shop"
                  className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-pink-600 transition-colors px-3 py-2 rounded-full hover:bg-pink-50"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {t("web.layout.navbar.shop")}
                </Link>
                <Link
                  href="/cart"
                  className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-pink-600 transition-colors px-3 py-2 rounded-full hover:bg-pink-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {t("web.layout.navbar.cart")}{cartCount > 0 ? ` (${cartCount})` : ""}
                </Link>
                <div className="text-sm px-4 font-normal Beautonomi-semibold text-secondary hover:bg-primary p-3 rounded-full cursor-pointer">
                  <Link href="/become-a-partner" className="">
                    <h2 className="">{t("web.layout.navbar.becomePartnerTitle")}</h2>
                  </Link>
                </div>
                <PreferencesTrigger
                  onClick={() => openPreferences({ surface: "navbar" })}
                />
                <Button
                  className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5"
                  onClick={handleProfileClick}
                >
                  <Image
                    src={sidebar}
                    alt={t("web.layout.navbar.sidebarIconAlt")}
                    className="h-5 w-5 me-1"
                  />
                  <Image
                    src={profile}
                    alt={t("web.layout.navbar.profileIconAlt")}
                    className="h-7 w-7 cursor-pointer"
                  />
                </Button>
                {isPopupVisible && (
                  <div
                    ref={popupRef}
                    className="absolute end-0 top-12 bg-white border rounded-lg shadow py-5 z-10"
                  >
                    <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                      <li className="pe-20 ps-5 mb-5">
                        <Link href="/learn">{t("web.layout.navbar.allHelpTopics")}</Link>
                      </li>
                      <li className=" mb-5">
                        <Link href="/" className="pe-20 ps-5">
                          {t("web.layout.navbar.beautyPartner")}
                        </Link>
                      </li>
                      <li className="border-b pb-4 mb-5">
                        <Link href="/" className="pe-20 ps-5">
                          {t("web.layout.navbar.resources")}
                        </Link>
                      </li>
                      <li className="pe-20 ps-5 mb-5">
                        <button
                          type="button"
                          className="pe-20 ps-5 text-start w-full"
                          onClick={() => {
                            setLoginModalMode("login");
                            setIsLoginModalOpen(true);
                            setIsPopupVisible(false);
                          }}
                        >
                          {t("web.layout.navbar.logIn")}
                        </button>
                      </li>
                      <li className="pe-20 ps-5">
                        <button
                          className="bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white px-4 py-2 rounded-md text-base font-normal transition-colors"
                          onClick={() => {
                            setLoginModalMode("signup");
                            setIsLoginModalOpen(true);
                            setIsPopupVisible(false);
                          }}
                        >
                          {t("web.layout.navbar.signUp")}
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
            {/* searchbar */}
            <div className="w-full  flex justify-center items-center relative h-full -top-10">
              <div
                ref={searchContainerRef}
                className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2 search-container
                ${
                  isExpanded || !isSticky
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                style={{
                  top: isSticky && !isExpanded ? "-100%" : "50%",
                  transform: `translate(-50%, ${
                    isSticky && !isExpanded ? "0" : "-50%"
                  })`,
                }}
              >
                {/* <SearchBar /> */}
              </div>
              <div
                className={`transition-all duration-300 ease-out absolute left-1/2 transform -translate-x-1/2
                ${
                  isSticky && !isExpanded
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                style={{
                  top: "50%",
                  transform: `translate(-50%, -50%) ${
                    isSticky && !isExpanded
                      ? "translateY(0)"
                      : "translateY(100%)"
                  }`,
                }}
                onClick={handleMinimizedSearchClick}
              >
                <div className="bg-white transition-all hover:shadow-lg cursor-pointer rounded-full searchShadow border border-[#DDDDDD] flex items-center">
                  <span className="text-secondary text-sm font-medium ps-8 pe-4 py-3">
                    {t("web.layout.navbar.serviceNeeded")}
                  </span>
                  <div className="h-4 w-px bg-gray-300 text-sm mx-2" />
                  <span className="text-secondary text-sm font-medium py-3 px-4">
                    {t("web.layout.navbar.anyTime")}
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-2" />
                  <span className="text-[#767A7C] text-sm font-light py-3 ps-4 pe-4">
                    {t("web.layout.navbar.search")}
                  </span>
                  <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 me-2 rounded-full">
                    <Search className="text-white w-6 h-6" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <LoginModal 
            open={isLoginModalOpen} 
            setOpen={setIsLoginModalOpen}
            initialMode={loginModalMode}
          />
        </div>
        <div className="block lg:hidden">
          <MobileSearchBar />
        </div>
      </div>
      {pathname !== "/search" &&
        pathname !== "/rooms" &&
        pathname !== "/accessibility" &&
        pathname !== "/beautonomi-friendly" &&
        pathname !== "/beautonomi-your-home" &&
        pathname !== "/aircover-for-host" &&
        pathname !== "/ambassador" &&
        pathname !== "/joinclass" &&
        pathname !== "/career" &&
        pathname !== "/experience-details" &&
        pathname !== "/gift-card" &&
        pathname !== "/help/articles" &&
        pathname !== "/help" &&
        pathname !== "/partner-owner-page" &&
        pathname !== "/reservation" &&
        pathname !== "/resources" &&
        pathname !== "/resources/pricing-place" &&
        pathname !== "/resources/like-to-host" && (
          <div
            className={`relative lg:block z-0 ${
              isFilterSliderSticky ? "top-0" : "fixed top-0"
            }`}
          >
            <FilterSlider />
          </div>
        )}
    </>
  );
};

export default Navbar;
