"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import logo from "../../../public/images/logo.svg";
import profile from "../../../public/images/filled-profile-icon.svg";
import sidebar from "../../../public/images/sidebar-icon.svg";
import SearchBar from "./search-bar";
import { Search } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { PreferencesTrigger } from "@/components/global/PreferencesTrigger";
import { useOpenGlobalPreferences } from "@/components/global/GlobalPreferencesDialog";

interface MinimizedSearchBarProps {
  defaultExpanded?: boolean;
}

const MinimizedSearchBar: React.FC<MinimizedSearchBarProps> = ({ defaultExpanded = false }) => {
  const { t } = useTranslation();
  const openPreferences = useOpenGlobalPreferences();
  const [searchQuery, setSearchQuery] = useState(""); 
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const navbarRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const handleProfileClick = () => {
    setIsPopupVisible(!isPopupVisible);
  };

  const handleOutsideClick = useCallback(
    (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsPopupVisible(false);
      }
    },
    []
  );

  const handleScroll = useCallback(() => {
    if (window.scrollY > 50) {
      setIsExpanded(false); 
    }
  }, []);

  const handleMinimizedSearchClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsExpanded(true); 
    window.scrollTo({ top: 0, behavior: "smooth" }); 
  };

  const handleSearchSubmit = (query: string) => {
    setSearchQuery(query); 
    setIsExpanded(false); 
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScroll);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [handleOutsideClick, handleScroll]);

  return (
    <div className={`sticky top-0 z-10 bg-white w-full transition-all duration-300 ease-out`} ref={navbarRef}>
      {/* Desktop */}
      <div className="border-b hidden lg:block">
        <div className="max-w-[2340px] mx-auto px-20">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-2 absolute start-8 top-4 z-50">
              <Link href="/">
                <Image src={logo} alt={t("web.layout.navbar.logoAlt")} className="h-12 w-auto" />
              </Link>
            </div>
            <div className="w-full flex justify-center items-center relative -ms-6">
              <div
                className={`${
                  isExpanded ? "block" : "hidden"
                } absolute left-1/2 transform -translate-x-1/2 search-container`}
                ref={searchContainerRef}
              >
                <SearchBar searchQuery={searchQuery} onSearchSubmit={handleSearchSubmit} />
              </div>
              {!isExpanded && (
                <div className="cursor-pointer" onClick={handleMinimizedSearchClick}>
                  <div className="bg-white transition-all hover:shadow-lg rounded-full searchShadow border border-[#DDDDDD] flex items-center">
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
                    <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 me-2 rounded-full">
                      <Search className="text-white w-6 h-6" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 absolute end-8 top-5 z-50">
              {/* <div className="text-sm px-4 font-normal Beautonomi-semibold text-secondary hover:bg-primary p-3 rounded-full cursor-pointer">
                <Link href="/become-a-partner">
                  <h2>Become a Partner</h2>
                </Link>
              </div> */}
              <PreferencesTrigger onClick={() => openPreferences({ surface: "navbar" })} />
              <Button className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5" onClick={handleProfileClick}>
                <Image src={sidebar} alt={t("web.layout.navbar.sidebarIconAlt")} className="h-5 w-5 me-1" />
                <Image src={profile} alt={t("web.layout.navbar.profileIconAlt")} className="h-7 w-7 cursor-pointer" />
              </Button>
              {isPopupVisible && (
                <div
                ref={popupRef}
                className="absolute end-0 top-12 bg-white border rounded-lg shadow-lg py-4 w-60 z-10" 
              >
                <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                  <li className="py-2">
                    <Link href="/learn" className="block ps-4">{t("web.layout.navbar.allHelpTopics")}</Link>  
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block ps-4">{t("web.layout.navbar.beautyPartner")}</Link>
                  </li>
                  <li className="py-2 border-b">
                    <Link href="/" className="block ps-4">{t("web.layout.navbar.resources")}</Link>
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block ps-4">{t("web.layout.navbar.logIn")}</Link>
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block ps-4">{t("web.layout.navbar.signUp")}</Link>
                  </li>
                </ul>
              </div>
              
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile */}
      <div className="border-b lg:hidden">
        <div className="max-w-[2340px] mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href="/">
                <Image src={logo} alt={t("web.layout.navbar.logoAlt")} className="h-10 w-auto" />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <PreferencesTrigger onClick={() => openPreferences({ surface: "navbar" })} />
              <Button className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5" onClick={handleProfileClick}>
                <Image src={sidebar} alt={t("web.layout.navbar.sidebarIconAlt")} className="h-5 w-5 me-1" />
                <Image src={profile} alt={t("web.layout.navbar.profileIconAlt")} className="h-7 w-7 cursor-pointer" />
              </Button>
              {isPopupVisible && (
                <div
                  ref={popupRef}
                  className="absolute end-4 top-16 bg-white border rounded-lg shadow-lg py-4 w-60 z-10" 
                >
                  <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                    <li className="py-2">
                      <Link href="/learn" className="block ps-4">{t("web.layout.navbar.allHelpTopics")}</Link>  
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block ps-4">{t("web.layout.navbar.beautyPartner")}</Link>
                    </li>
                    <li className="py-2 border-b">
                      <Link href="/" className="block ps-4">{t("web.layout.navbar.resources")}</Link>
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block ps-4">{t("web.layout.navbar.logIn")}</Link>
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block ps-4">{t("web.layout.navbar.signUp")}</Link>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="pb-4">
            {isExpanded ? (
              <div ref={searchContainerRef}>
                <SearchBar searchQuery={searchQuery} onSearchSubmit={handleSearchSubmit} />
              </div>
            ) : (
              <div className="cursor-pointer" onClick={handleMinimizedSearchClick}>
                <div className="bg-white transition-all hover:shadow-lg rounded-full searchShadow border border-[#DDDDDD] flex items-center">
                  <span className="text-secondary text-sm font-medium ps-4 pe-3 py-2.5">
                    {t("web.layout.navbar.serviceNeeded")}
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-1.5" />
                  <span className="text-secondary text-sm font-medium py-2.5 px-3">
                    {t("web.layout.navbar.anyTime")}
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-1.5" />
                  <span className="text-[#767A7C] text-sm font-light py-2.5 ps-3 pe-3">
                    {t("web.layout.navbar.search")}
                  </span>
                  <Button className="w-8 h-8 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-1.5 me-2 rounded-full">
                    <Search className="text-white w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinimizedSearchBar;
