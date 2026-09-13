"use client";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import logo from "../../../public/images/Group 5 (1).svg";
import global from "./../../../public/images/global-icon.svg";
import profile from "./../../../public/images/filled-profile-icon.svg";
import sidebar from "./../../../public/images/sidebar-icon.svg";
import { Button } from "../ui/button";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

const Navbar1 = () => {
  const { t } = useTranslation();
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null); // Provide the correct type here

  const handleProfileClick = () => {
    setIsPopupVisible(!isPopupVisible);
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
      setIsPopupVisible(false);
    }
  };

  useEffect(() => {
    if (isPopupVisible) {
      document.addEventListener("mousedown", handleOutsideClick);
    } else {
      document.removeEventListener("mousedown", handleOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isPopupVisible]);

  return (
    <div className="sticky top-0 z-10 bg-white ">
      <div className="container">
        <div className="flex justify-between items-center py-3 mb-20">
          <div className="flex items-center gap-2  w-44 h-20">
          <Link href="/">
            <Image src={logo} alt={t("web.layout.navbar.logoAlt")} className="object-cover"/>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Image src={global} alt={t("web.layout.navbar.globalIconAlt")} className="h-5 w-5" />
            <Button className="flex gap-4 border rounded-full h-10 bg-white p-2" 
                onClick={handleProfileClick}
            >
              <Image src={sidebar} alt={t("web.layout.navbar.sidebarIconAlt")} className="h-5 w-5" />
              <Image
                src={profile}
                alt={t("web.layout.navbar.profileIconAlt")}
                className="h-7 w-7 cursor-pointer"
              />
            </Button>

            {isPopupVisible && (
              <div
                ref={popupRef}
                className="absolute right-5 top-14 bg-white border rounded-lg shadow py-5 z-10"
              >
                <ul className="text-secondary text-base font-normal ">
                  <li className="pe-20 ps-5 mb-5">
                    <Link href="/">{t("web.layout.navbar.allHelpTopics")}</Link>
                  </li>
                  <li className="border-b pb-4 mb-5">
                    <Link href="/" className="pe-20 ps-5">
                    {t("web.layout.navbar.beautyPartnerResources")}
                    </Link>
                  </li>
                  <li className="pe-20 ps-5 mb-5">
                    <Link href="/">{t("web.layout.navbar.logIn")}</Link>
                  </li>
                  <li className="pe-20 ps-5 mb-5">
                    <Link href="/">{t("web.layout.navbar.signUp")}</Link>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar1;
