"use client";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import logo from "../../../../public/images/Group 2 (1).svg";
import global from "./../../../../public/images/global-icon.svg";
import profile from "./../../../../public/images/filled-profile-icon.svg";
import sidebar from "./../../../../public/images/sidebar-icon.svg";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import LanguageModal from "@/components/global/langauges-modal";

const HostPageNavbar: React.FC = () => {
  const [isPopupVisible, setIsPopupVisible] = useState<boolean>(false);
  const popupRef = useRef<HTMLDivElement | null>(null);

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

  const [modalOpen, setModalOpen] = useState(false);


  const handleOpenModal = () => {
    setModalOpen(true);
  };
  return (
    <div className=" sticky top-0 z-10 bg-white container">
      <div className="flex justify-between items-center py-3 mb-20">
      <Link href="/">
        <div className="flex items-center gap-2  w-44 h-20">
          <Image src={logo} alt="Logo" />
        </div>
        </Link>
        <div className="flex items-center gap-3">
        <div className="text-sm px-4 font-normal Airbnb-normal text-secondary hover:bg-primary p-3 rounded-full cursor-pointer">
          <Link href="/become-a-partner" className="">
            <h2 className="">Become a Partner</h2>
          </Link>
        </div>
        <div onClick={handleOpenModal} className="cursor-pointer">
          <Image src={global} alt="Global Settings" className="h-5 w-5" />
        </div>
        <Button
          className="flex gap-2 border rounded-full h-10 bg-white px-2 py-5"
          onClick={handleProfileClick}
        >
          <Image src={sidebar} alt="Sidebar Icon" className="h-5 w-5 mr-1" />
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
            <ul className="text-secondary text-base font-normal Airbnb-normal">
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
                <Link href="/">Sign Up</Link>
              </li>
            </ul>
          </div>
        )}
      </div>
      </div>
      <LanguageModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
};

export default HostPageNavbar;
