"use client";

import { useTranslation } from "@beautonomi/i18n";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import Search from "./../../../public/images/search-alt-1-svgrepo-com.svg";
import Sidebar from "./../../../public/images/sidebar-icon.svg";
import CloseIcon from "./../../../public/images/close-icon.svg";
import ChevronDown from "./../../../public/images/chevron-down-svgrepo-com(1).svg";
import ChevronUp from "./../../../public/images/chevron-up-svgrepo-com(1).svg";
import Link from "next/link";

const navItems = [
  { textKey: "web.layout.navbar5.home", href: "#" },
  { textKey: "web.layout.navbar5.eventsPresentations", href: "#" },
  { textKey: "web.layout.navbar5.pressReleases", href: "#" },
  { textKey: "web.layout.navbar5.stockInfo", href: "#" },
  { textKey: "web.layout.navbar5.financials", href: "#" },
  { textKey: "web.layout.navbar5.governance", href: "#" },
  { textKey: "web.layout.navbar.resources", href: "#" },
];

const dropdownContents = [
  [
    { textKey: "web.layout.navbar5.stockQuote", href: "#" },
    { textKey: "web.layout.navbar5.analystCoverage", href: "#" },
  ],
  [
    { textKey: "web.layout.navbar5.quarterlyResults", href: "#" },
    { textKey: "web.layout.navbar5.secFilings", href: "#" },
  ],
  [
    { textKey: "web.layout.navbar5.executiveManagement", href: "#" },
    { textKey: "web.layout.navbar5.boardOfDirectors", href: "#" },
    { textKey: "web.layout.navbar5.committeeComposition", href: "#" },
    { textKey: "web.layout.navbar5.governanceDocuments", href: "#" },
    { textKey: "web.layout.navbar5.sustainability", href: "#" },
  ],
  [
    { textKey: "web.layout.navbar5.investorFaqs", href: "#" },
    { textKey: "web.layout.navbar5.investorEmailAlerts", href: "#" },
    { textKey: "web.layout.navbar5.investorContacts", href: "#" },
  ],
];

const Navbar5: React.FC = () => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null); // State for expanded sub-items
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const handleSearchMouseEnter = () => {
    setSearchVisible(true);
  };

  const handleSearchMouseLeave = () => {};

  const handleClickOutside = (event: MouseEvent) => {
    if (
      searchRef.current &&
      !searchRef.current.contains(event.target as Node)
    ) {
      setSearchVisible(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleMouseEnter = (index: number) => {
    if (index >= 3) {
      setActiveIndex(index);
    }
  };

  const handleMouseLeave = () => {
    setTimeout(() => {
      if (
        !containerRef.current?.matches(":hover") &&
        !searchRef.current?.matches(":hover")
      ) {
        setActiveIndex(null);
      }
    }, 100);
  };

  const toggleSubItems = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="sticky top-0 z-10 bg-white">
      <div className="container">
        <div className="flex justify-between items-center py-3 mb-20">
          <div className="flex gap-8 items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">{t("web.seo.siteName")}</span>
          </Link>
          </div>
          <div className="md:hidden flex items-center">
            <button
              className="p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Image src={Sidebar} alt={t("web.layout.navbar.menu")} />
            </button>
          </div>
          <div
            className="hidden md:flex items-center gap-5"
            ref={containerRef}
            onMouseLeave={handleMouseLeave}
          >
            {navItems.map((item, index) => (
              <div
                key={index}
                className="relative group"
                onMouseEnter={() => handleMouseEnter(index)}
              >
                <a
                  href={item.href}
                  className={`relative text-sm font-semibold text-secondary group`}
                >
                  {t(item.textKey)}
                  {index >= 0 && (
                    <span
                      className={`absolute left-0 bottom-0 w-full h-[2px] bg-black transition-transform duration-300 transform ${
                        activeIndex === index ? "scale-x-100" : "scale-x-0"
                      } ${activeIndex !== index && "group-hover:scale-x-100"}`}
                    ></span>
                  )}
                </a>
                {index >= 3 && activeIndex === index && (
                  <div className="absolute right-0 top-full mt-2 bg-white border rounded-lg shadow py-5 z-10 w-60">
                    <ul className="text-secondary text-sm font-normal  space-y-5">
                      {dropdownContents[index - 3].map((link, linkIndex) => (
                        <li key={linkIndex} className="pe-4 ps-5">
                          <a href={link.href}>{t(link.textKey)}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            <div
              className="relative"
              onMouseEnter={handleSearchMouseEnter}
              onMouseLeave={handleSearchMouseLeave}
              ref={searchRef}
            >
              <Image src={Search} alt={t("web.layout.navbar.search")} className="cursor-pointer" />
              {searchVisible && (
                <input
                  type="text"
                  placeholder={t("web.layout.navbar5.searchPlaceholder")}
                  className="absolute top-full right-0 mt-2 border rounded-lg p-2 shadow-md w-48"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        </div>
        {/* Mobile Menu */}
        <div
          className={`md:hidden fixed inset-0 bg-white shadow-lg z-20 transition-transform duration-300 transform ${
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex justify-between items-center p-4 border-b">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">{t("web.seo.siteName")}</span>
            </Link>
            <button onClick={() => setMobileMenuOpen(false)}>
              <Image src={CloseIcon} alt={t("web.layout.navbar5.closeMenuAlt")} />
            </button>
          </div>
          <div className="relative mt-4 p-4">
              <button
                className="border  w-full p-3 rounded-xl flex items-center space-x-2 text-secondary"
                onClick={() => setSearchVisible(!searchVisible)}
              >
                <Image src={Search} alt={t("web.layout.navbar5.searchInvestorsAlt")} />
                <span>{t("web.layout.navbar.search")}</span>
              </button>
              {searchVisible && (
                <input
                  type="text"
                  placeholder={t("web.layout.navbar5.searchPlaceholder")}
                  className="mt-2 border rounded-lg p-2 shadow-md w-full"
                />
              )}
            </div>
          <div className="flex flex-col p-4">
            {navItems.map((item, index) => (
              <div key={index} className="relative">
                <button
                  className="flex items-center justify-between w-full py-2 text-secondary text-base mb-4 font-semibold"
                  onClick={() => toggleSubItems(index)}
                >
                  {t(item.textKey)}
                  {index >= 3 && (
                    <Image
                      src={expandedIndex === index ? ChevronUp : ChevronDown}
                      alt={t("web.layout.navbar5.toggleAlt")}
                      className="w-7 h-7"
                    />
                  )}
                </button>
                {index >= 3 && expandedIndex === index && (
                  <div className="flex flex-col mt-2">
                    {dropdownContents[index - 3].map((link, linkIndex) => (
                      <a
                        key={linkIndex}
                        href={link.href}
                        className="py-2 text-secondary text-sm font-normal ms-5"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t(link.textKey)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar5;
