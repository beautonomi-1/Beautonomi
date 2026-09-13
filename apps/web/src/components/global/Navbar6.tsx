"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "./../../../public/images/Group 4 (1).svg";
import Global from "./../../../public/images/global-icon.svg";
import Search from "./../../../public/images/search-alt-1-svgrepo-com.svg";
import Chevron from "./../../../public/images/chevron-down-svgrepo-com(1).svg";
import SidebarIcon from "./../../../public/images/sidebar-icon.svg";
import CloseIcon from "./../../../public/images/close-icon.svg";
import XSocial from "./../../../public/images/x-icon.svg";
import Pinterest from "./../../../public/images/pinterest-icon.svg";
import Instagram from "./../../../public/images/instagram-icon.svg";
import Tiktok from "./../../../public/images/tiktok-icon.svg";
import { Input } from "../ui/input";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";

const Navbar6 = () => {
  const { t } = useTranslation();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [isHovered, setHovered] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileLangDropdownOpen, setMobileLangDropdownOpen] = useState(false);

  const socialMedia = [
    { src: XSocial, alt: "X", link: "https://x.com/beautonomi" },
    {
      src: Pinterest,
      alt: t("web.layout.navbar6.pinterest"),
      link: "https://www.pinterest.com/beautonomi",
    },
    {
      src: Tiktok,
      alt: t("web.layout.navbar6.tiktok"),
      link: "https://www.tiktok.com/@beautonomi",
    },
{ src: Instagram, alt: t("web.layout.navbar6.instagram"), link: "https://instagram.com/beautonomi" },
  ];

  const navItems = [
    { text: t("web.layout.navbar6.aboutUs"), href: "/about-us" },
    { text: t("web.layout.navbar6.mediaAssets"), href: "/media-assets" },
    { text: t("web.layout.navbar6.productReleases"), href: "/product-releases" },
    { text: t("web.layout.navbar6.contact"), href: PLATFORM_CONTACT_HREF },
  ];

  const languages = [
    { code: "en", name: t("web.layout.languageModal.english") },
    { code: "es", name: t("web.layout.languageModal.spanish") },
    { code: "fr", name: t("web.layout.languageModal.french") },
    { code: "de", name: t("web.layout.languageModal.german") },
    { code: "zh", name: t("web.layout.languageModal.chinese") },
    { code: "jp", name: t("web.layout.navbar6.japanese") },
    { code: "kr", name: t("web.layout.navbar6.korean") },
  ];

  return (
    <div className=" sticky top-0 z-10 bg-white">
      <div className="container">
        <div className="flex justify-between items-center">
          <div className="flex gap-3 items-center w-44 h-20">
            <Image src={Logo} alt={t("web.layout.navbar.logoAlt")} className="w-44" />
          </div>
          <div className="block md:hidden">
            <Image
              src={SidebarIcon}
              alt={t("web.layout.navbar6.sidebarAlt")}
              onClick={() => setSidebarOpen(true)}
              className="cursor-pointer"
            />
          </div>
          <div className="hidden md:flex gap-7 items-center">
            <div className="flex gap-4 items-center">
              {navItems.map((item, index) => (
                <Link key={index} href={item.href}>
                  <p className="text-base font-normal  text-secondary block hover:bg-[#f2f2f2] p-2 rounded-lg">
                    {item.text}
                  </p>
                </Link>
              ))}
            </div>
            <div
              className="relative flex items-center"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => {
                setTimeout(() => {
                  if (!document.querySelector(".dropdown-menu:hover")) {
                    setHovered(false);
                  }
                }, 100);
              }}
            >
              <Image
                src={Global}
                alt={t("web.layout.navbar6.globalAlt")}
                className="h-5 w-5 cursor-pointer"
                onMouseEnter={() => setDropdownOpen(true)}
                onMouseLeave={() => setDropdownOpen(false)}
              />
              <Image src={Chevron} alt="Chevron" className="h-5 w-5 ms-1" />
              {(isDropdownOpen || isHovered) && (
                <div
                  className="absolute top-full right-0 mt-2 w-40 bg-white border border-gray-300 rounded-lg shadow-lg z-10 dropdown-menu"
                  onMouseEnter={() => setDropdownOpen(true)}
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  <ul className="flex flex-col list-none m-0 p-2">
                    {languages.map((language) => (
                      <li
                        key={language.code}
                        className="p-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {language.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-1 items-center">
              <Image src={Search} alt={t("common.search")} className="h-5 w-5" />
              <p>{t("common.search")}</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed top-0 right-0 w-full h-full bg-white shadow-lg transition-transform transform ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full"
        } z-20`}
      >
        <div className="justify-end flex p-4 mb-4">
          <Image
            src={CloseIcon}
            alt={t("common.close")}
            onClick={() => setSidebarOpen(false)}
            className="h-6 w-6 cursor-pointer "
          />
        </div>
        <div className="px-4">
          <div className="flex items-center border px-3 py-1 rounded-lg mb-4">
            <Image src={Search} alt="" />
            <Input
              type="text"
              placeholder={t("web.layout.navbar6.searchPlaceholder")}
              className="w-full"
            />
          </div>
          <div className="flex justify-between items-center border p-3  rounded-lg">
            <Image src={Global} alt="Global" className="ms-2 h-5 w-5" />
            <Image
              src={Chevron}
              alt={t("web.layout.navbar6.chevronAlt")}
              className="h-5 w-5 ms-1 cursor-pointer"
              onClick={() =>
                setMobileLangDropdownOpen(!isMobileLangDropdownOpen)
              }
            />
          </div>
          {isMobileLangDropdownOpen && (
            <div className="mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              <ul className="flex flex-col list-none m-0 p-2">
                {languages.map((language) => (
                  <li
                    key={language.code}
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                  >
                    {language.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <nav className="border-b mb-4">
          <ul className="flex flex-col p-4">
            {navItems.map((item, index) => (
              <li key={index} className="py-2">
                <Link href={item.href}>
                  <p className="text-base font-normal  text-secondary block hover:bg-[#f2f2f2] p-2 rounded-lg">
                    {item.text}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex gap-4 mb-12 md:mb-16 justify-center">
          {socialMedia.map((social, index) => (
            <a
              key={index}
              href={social.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="border rounded-full p-2 border-secondary">
                <Image
                  src={social.src}
                  alt={social.alt}
                  width={20}
                  height={20}
                />
              </div>
            </a>
          ))}
        </div>
      </div>

      <div
        className={`fixed inset-0 bg-black transition-opacity ${
          isSidebarOpen ? "opacity-50" : "opacity-0 pointer-events-none"
        } z-10`}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );
};

export default Navbar6;
