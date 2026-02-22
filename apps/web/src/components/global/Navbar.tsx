'use client'
import React, { useState } from "react";
import Image from "next/image";
import logo from "../../../public/images/logo.svg";
import home from "../../../public/images/homeplus.svg";
import { Button } from "../ui/button";
import LoginModal from "./login-modal";
import Link from "next/link";

const Navbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false); 

  const handleLoginClick = () => {
    setIsModalOpen(true); 
  };

  return (
    <div className="sticky top-0 z-10">
      <div className="bg-white">
        <div className="container">
          <div className="flex justify-between items-center py-3 md:mb-0">
            <Link href="/">
            <Image src={logo} alt="Logo" />
            </Link>
            <div className="hidden md:flex items-center gap-5">
              <p className="text-secondary text-base font-normal cursor-pointer" onClick={handleLoginClick}>
                Sign in to Beautonomi?
              </p>
              <Link href="/signup">
                <Button className="bg-gradient-to-r from-[#FF0077] to-[#D60565] h-12 flex gap-4 max-w-80">
                  <Image src={home} alt="Home Plus Icon" />
                  Create Beautonomi Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg">
        <p className="text-secondary text-base font-normal text-center mb-2" onClick={handleLoginClick}>
          Ready to Beautonomi it?
        </p>
        <Link href="/signup" className="w-full">
          <Button className="bg-gradient-to-r from-[#FF0077] to-[#D60565] h-12 flex gap-4 w-full">
            <Image src={home} alt="Home Plus Icon" />
            Beautonomi Setup
          </Button>
        </Link>
      </div>

      <LoginModal open={isModalOpen} setOpen={setIsModalOpen} />  
    </div>
  );
};

export default Navbar;
