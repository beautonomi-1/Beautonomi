"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PlatformLogo from "../platform/PlatformLogo";
import global from "../../../public/images/global-icon.svg";
import profile from "../../../public/images/filled-profile-icon.svg";
import sidebar from "../../../public/images/sidebar-icon.svg";
import SearchBar from "../global/search-bar";
import FilterSlider from "@/app/home/components/filter-slider";
import { Menu, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import MobileSearchBar from "./mobile-search-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import LanguagesModal from "../global/langauges-modal";
import LoginModal from "../global/login-modal";
import { useAuth } from "@/providers/AuthProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const [isSticky, setIsSticky] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollY = useRef<number>(0);
  const throttleTimeout = useRef<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const [isFilterSliderSticky, setIsFilterSliderSticky] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration mismatch by only rendering Radix components after mount
  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

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

  const handleOpenModal = () => {
    setModalOpen(true);
  };

  const handleSearchSubmit = (query: string) => {
    setSearchQuery(query);
    setIsExpanded(false);
  };

  const handleOpenLanguageModal = () => {
    setModalOpen(true);
    setIsSideMenuOpen(false);
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white w-full overflow-x-hidden max-w-full">
        <div className=" flex lg:hidden items-center justify-between px-4 pt-4 w-full max-w-full overflow-x-hidden">
          <div className="mx-auto  w-44">
            <Link href="/" className="">
              <PlatformLogo alt="Logo" className="w-44" />
            </Link>
          </div>
          <div className="">
            {isMounted ? (
              <>
                {/* Show "Become a partner" menu for unauthenticated users */}
                {!user && !authLoading ? (
                  <Sheet open={isSideMenuOpen} onOpenChange={setIsSideMenuOpen}>
                    <SheetTrigger asChild>
                      <button 
                        type="button" 
                        aria-label="Open menu"
                        className="flex items-center justify-center"
                      >
                        <Menu className="h-6 w-6 mt-2 sm:mt-5 text-gray-700" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto bg-white">
                      <SheetHeader>
                        <SheetTitle className="text-center text-lg font-normal">
                          Become a partner
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
                          Log In
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white" 
                          size="lg"
                          onClick={() => {
                            setIsSideMenuOpen(false);
                            router.push("/signup");
                          }}
                        >
                          Sign Up
                        </Button>
                      </div>
                      <button
                        className="flex items-center space-x-1 cursor-pointer mt-6"
                        onClick={() => {
                          setIsSideMenuOpen(false);
                          handleOpenLanguageModal();
                        }}
                      >
                        <Image
                          src={global}
                          alt="Global Settings"
                          className="w-4 h-4"
                        />
                        <span className="font-light text-sm underline">
                          English (US)
                        </span>
                      </button>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Sheet open={isSideMenuOpen} onOpenChange={setIsSideMenuOpen}>
                    <SheetTrigger asChild>
                      <button 
                        type="button" 
                        aria-label="Open menu"
                        className="flex items-center justify-center"
                      >
                        <Menu className="h-6 w-6 mt-2 sm:mt-5 text-gray-700" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto bg-white">
                      <SheetHeader>
                        <SheetTitle>Menu</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6">
                        <ul className="text-secondary text-base font-light space-y-4">
                          <li>
                            <Link href="/shop" className="flex items-center gap-2">
                              <ShoppingBag className="h-4 w-4" /> Shop Products
                            </Link>
                          </li>
                          <li>
                            <Link href="/cart" className="flex items-center gap-2">
                              <ShoppingCart className="h-4 w-4" /> My Cart
                            </Link>
                          </li>
                          <li>
                            <Link href="/become-a-partner">Become a partner</Link>
                          </li>
                          <li className="border-b pb-4">
                            <Link href="/">Resources</Link>
                          </li>
                        </ul>
                        <div className="mt-6 space-y-4 mb-3">
                          <Button variant="outline" className="w-full" size="lg">
                            Log In
                          </Button>
                          <Button 
                            variant="secondary" 
                            className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white" 
                            size="lg"
                          >
                            Sign Up
                          </Button>
                        </div>
                        <button
                          className="flex items-center space-x-1 cursor-pointer"
                          onClick={handleOpenLanguageModal}
                        >
                          <Image
                            src={global}
                            alt="Global Settings"
                            className="w-4 h-4"
                          />
                          <span className="font-light text-sm underline">
                            English (US)
                          </span>
                        </button>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </>
            ) : (
              <button 
                type="button" 
                aria-label="Open menu"
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
                className={`flex items-center gap-2 absolute left-8 transition-all duration-300 z-50 ${
                  isSticky && !isExpanded ? "top-2" : "top-4"
                }`}
              >
                <Link href="/">
                  <PlatformLogo alt="Logo" className="h-12 w-auto" />
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
                        Bookings
                      </TabsTrigger>
                      <TabsTrigger
                        className="bg-transparent data-[state=active]:shadow-none"
                        value="showcase"
                      >
                        Show Case
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
                          <span className="text-secondary text-sm font-medium pl-8 pr-4 py-3">
                            Service needed?
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-secondary text-sm font-medium py-3 px-4">
                            Any time
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-[#767A7C] text-sm font-light py-3 pl-4 pr-4">
                            Search
                          </span>
                          <Link href="/search">
                            <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mr-2 rounded-full">
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
                          <span className="text-secondary font-medium pl-8 pr-4 py-3">
                            Service needed?
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-secondary font-medium py-3 px-4">
                            Any time
                          </span>
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          <span className="text-[#767A7C] font-light py-3 pl-4 pr-4">
                            Search
                          </span>
                          <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mr-2 rounded-full">
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
                className={`flex items-center gap-3 absolute right-8 transition-all duration-300 z-50 ${
                  isSticky && !isExpanded ? "top-4" : "top-6"
                }`}
              >
                <Link
                  href="/shop"
                  className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-pink-600 transition-colors px-3 py-2 rounded-full hover:bg-pink-50"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Shop
                </Link>
                <Link
                  href="/cart"
                  className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-pink-600 transition-colors px-3 py-2 rounded-full hover:bg-pink-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Cart
                </Link>
                <div className="text-sm px-4 font-normal Beautonomi-semibold text-secondary hover:bg-primary p-3 rounded-full cursor-pointer">
                  <Link href="/become-a-partner" className="">
                    <h2 className="">Become a Partner</h2>
                  </Link>
                </div>
                <div onClick={handleOpenModal} className="cursor-pointer">
                  <Image
                    src={global}
                    alt="Global Settings"
                    className="h-5 w-5"
                  />
                </div>
                <Button
                  className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5"
                  onClick={handleProfileClick}
                >
                  <Image
                    src={sidebar}
                    alt="Sidebar Icon"
                    className="h-5 w-5 mr-1"
                  />
                  <Image
                    src={profile}
                    alt="Profile Icon"
                    className="h-7 w-7 cursor-pointer"
                  />
                </Button>
                {isPopupVisible && (
                  <div
                    ref={popupRef}
                    className="absolute right-0 top-12 bg-white border rounded-lg shadow py-5 z-10"
                  >
                    <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                      <li className="pr-20 pl-5 mb-5">
                        <Link href="/">All help topics</Link>
                      </li>
                      <li className=" mb-5">
                        <Link href="/" className="pr-20 pl-5">
                          Beauty partner
                        </Link>
                      </li>
                      <li className="border-b pb-4 mb-5">
                        <Link href="/" className="pr-20 pl-5">
                          Resources
                        </Link>
                      </li>
                      <li className="pr-20 pl-5 mb-5">
                        <Link href="/">Log In</Link>
                      </li>
                      <li className="pr-20 pl-5">
                        <button
                          className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white px-4 py-2 rounded-md text-base font-normal transition-colors"
                          onClick={() => {
                            setLoginModalMode("signup");
                            setIsLoginModalOpen(true);
                            setIsPopupVisible(false);
                          }}
                        >
                          Sign Up
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
                  <span className="text-secondary text-sm font-medium pl-8 pr-4 py-3">
                    Service needed?
                  </span>
                  <div className="h-4 w-px bg-gray-300 text-sm mx-2" />
                  <span className="text-secondary text-sm font-medium py-3 px-4">
                    Any time
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-2" />
                  <span className="text-[#767A7C] text-sm font-light py-3 pl-4 pr-4">
                    Search
                  </span>
                  <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mr-2 rounded-full">
                    <Search className="text-white w-6 h-6" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {isMounted && <LanguagesModal open={modalOpen} onOpenChange={setModalOpen} />}
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
        pathname !== "/against-discrimination" &&
        pathname !== "/beautonomi-financial-results" &&
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
        pathname !== "/hostpage" &&
        pathname !== "/investors" &&
        pathname !== "/news" &&
        pathname !== "/release" &&
        pathname !== "/reservation" &&
        pathname !== "/resources" &&
        pathname !== "/resources/pricing-place" &&
        pathname !== "/resources/like-to-host" &&
        pathname !== "/stays" && (
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
