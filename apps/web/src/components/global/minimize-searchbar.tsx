"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import logo from "../../../public/images/logo.svg";
import global from "../../../public/images/global-icon.svg";
import profile from "../../../public/images/filled-profile-icon.svg";
import sidebar from "../../../public/images/sidebar-icon.svg";
import SearchBar from "./search-bar";
import { Search } from "lucide-react";
import LanguagesModal from "./langauges-modal";

interface MinimizedSearchBarProps {
  defaultExpanded?: boolean;
}

const MinimizedSearchBar: React.FC<MinimizedSearchBarProps> = ({ defaultExpanded = false }) => {

  const [searchQuery, setSearchQuery] = useState(""); 
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const navbarRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const [_isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [_isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

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

  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenModal = () => {
    setModalOpen(true);
  };
  const _handleOpenLanguageModal = () => {
    setIsLanguageModalOpen(true);
    setIsSideMenuOpen(false);
  };

  return (
    <div className={`sticky top-0 z-10 bg-white w-full transition-all duration-300 ease-out`} ref={navbarRef}>
      {/* Desktop */}
      <div className="border-b hidden lg:block">
        <div className="max-w-[2340px] mx-auto px-20">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-2 absolute left-8 top-4 z-50">
              <Link href="/">
                <Image src={logo} alt="Logo" className="h-12 w-auto" />
              </Link>
            </div>
            <div className="w-full flex justify-center items-center relative -ml-6">
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
                    <Button className="w-9 h-9 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mr-2 rounded-full">
                      <Search className="text-white w-6 h-6" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 absolute right-8 top-5 z-50">
              {/* <div className="text-sm px-4 font-normal Beautonomi-semibold text-secondary hover:bg-primary p-3 rounded-full cursor-pointer">
                <Link href="/become-a-partner">
                  <h2>Become a Partner</h2>
                </Link>
              </div> */}
              <div onClick={handleOpenModal} className="cursor-pointer">
                <Image src={global} alt="Global Settings" className="h-5 w-5" />
              </div>
              <Button className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5" onClick={handleProfileClick}>
                <Image src={sidebar} alt="Sidebar Icon" className="h-5 w-5 mr-1" />
                <Image src={profile} alt="Profile Icon" className="h-7 w-7 cursor-pointer" />
              </Button>
              {isPopupVisible && (
                <div
                ref={popupRef}
                className="absolute right-0 top-12 bg-white border rounded-lg shadow-lg py-4 w-60 z-10" 
              >
                <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                  <li className="py-2">
                    <Link href="/" className="block pl-4">All help topics</Link>  
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block pl-4">Beauty partner</Link>
                  </li>
                  <li className="py-2 border-b">
                    <Link href="/" className="block pl-4">Resources</Link>
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block pl-4">Log In</Link>
                  </li>
                  <li className="py-2">
                    <Link href="/" className="block pl-4">Sign Up</Link>
                  </li>
                </ul>
              </div>
              
              )}
            </div>
          </div>
        </div>
        <LanguagesModal open={modalOpen} onOpenChange={setModalOpen} />
      </div>
      
      {/* Mobile */}
      <div className="border-b lg:hidden">
        <div className="max-w-[2340px] mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href="/">
                <Image src={logo} alt="Logo" className="h-10 w-auto" />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div onClick={handleOpenModal} className="cursor-pointer">
                <Image src={global} alt="Global Settings" className="h-5 w-5" />
              </div>
              <Button className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5" onClick={handleProfileClick}>
                <Image src={sidebar} alt="Sidebar Icon" className="h-5 w-5 mr-1" />
                <Image src={profile} alt="Profile Icon" className="h-7 w-7 cursor-pointer" />
              </Button>
              {isPopupVisible && (
                <div
                  ref={popupRef}
                  className="absolute right-4 top-16 bg-white border rounded-lg shadow-lg py-4 w-60 z-10" 
                >
                  <ul className="text-secondary text-base font-normal Beautonomi-semibold">
                    <li className="py-2">
                      <Link href="/" className="block pl-4">All help topics</Link>  
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block pl-4">Beauty partner</Link>
                    </li>
                    <li className="py-2 border-b">
                      <Link href="/" className="block pl-4">Resources</Link>
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block pl-4">Log In</Link>
                    </li>
                    <li className="py-2">
                      <Link href="/" className="block pl-4">Sign Up</Link>
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
                  <span className="text-secondary text-sm font-medium pl-4 pr-3 py-2.5">
                    Service needed?
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-1.5" />
                  <span className="text-secondary text-sm font-medium py-2.5 px-3">
                    Any time
                  </span>
                  <div className="h-4 w-px bg-gray-300 mx-1.5" />
                  <span className="text-[#767A7C] text-sm font-light py-2.5 pl-3 pr-3">
                    Search
                  </span>
                  <Button className="w-8 h-8 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-1.5 mr-2 rounded-full">
                    <Search className="text-white w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <LanguagesModal open={modalOpen} onOpenChange={setModalOpen} />
      </div>
    </div>
  );
};

export default MinimizedSearchBar;
