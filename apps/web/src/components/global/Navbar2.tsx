"use client";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import logo from "./../../../public/images/logo.svg";
import profile from "./../../../public/images/filled-profile-icon.svg";
import sidebar from "./../../../public/images/sidebar-icon.svg";
import { Button } from "../ui/button";
import Link from "next/link";

const Navbar2 = () => {
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null); // Provide the correct type here


  const handleProfileClick = () => {
    setIsPopupVisible(!isPopupVisible);
  };

  const handleOutsideClick = (event: { target: any }) => {
    if (popupRef.current && !popupRef.current.contains(event.target)) {
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
    <div className="relative container">
      <div className="flex justify-between items-center py-3 mb-20">
      <Link href="/">
        <Image src={logo} alt="Logo" />
        </Link>
        <div className="flex items-center gap-3">
          <Button className="flex gap-4 border rounded-full h-12   bg-white p-4">
            <Image src={sidebar} alt="Sidebar Icon" className="h-5 w-5" />
            <Image
              src={profile}
              alt="Profile Icon"
              className="h-7 w-7 cursor-pointer"
              onClick={handleProfileClick}
            />
          </Button>

          {isPopupVisible && (
            <div
              ref={popupRef}
              className="absolute right-5 top-14 bg-white border rounded-lg shadow py-5 z-10"
            >
              <ul className=" text-secondary text-base font-normal ">
                <li className="pr-24 pl-5 mb-5">
                  <Link href="/">Sign Up</Link>
                </li>
                <li className="border-b  pb-4 mb-5">
                  <Link href="/" className=" pr-24 pl-5">
                    Log In
                  </Link>
                </li>
                <li className="pr-24 pl-5 mb-5">
                  <Link href="/">Host your home</Link>
                </li>
                <li className="pr-24 pl-5">
                  <Link href="/">Help Center</Link>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar2;
