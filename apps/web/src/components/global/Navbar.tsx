'use client'
import React, { useState } from "react";
import Image from "next/image";
import logo from "../../../public/images/logo.svg";
import home from "../../../public/images/homeplus.svg";
import { Button } from "../ui/button";
import LoginModal from "./login-modal";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

const Navbar = () => {
  const { t } = useTranslation();
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
            <Image src={logo} alt={t("web.layout.navbar.logoAlt")} />
            </Link>
            <div className="hidden md:flex items-center gap-5">
              <p className="text-secondary text-base font-normal cursor-pointer" onClick={handleLoginClick}>
                {t("web.layout.navbar.signInToBeautonomi")}
              </p>
              <Link href="/signup">
                <Button className="bg-gradient-to-r from-[#FF0077] to-[#D60565] h-12 flex gap-4 max-w-80">
                  <Image src={home} alt={t("web.layout.navbar.homePlusIconAlt")} />
                  {t("web.layout.navbar.createAccount")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg">
        <p className="text-secondary text-base font-normal text-center mb-2" onClick={handleLoginClick}>
          {t("web.layout.navbar.readyToBeautonomi")}
        </p>
        <Link href="/signup" className="w-full">
          <Button className="bg-gradient-to-r from-[#FF0077] to-[#D60565] h-12 flex gap-4 w-full">
            <Image src={home} alt={t("web.layout.navbar.homePlusIconAlt")} />
            {t("web.layout.navbar.setup")}
          </Button>
        </Link>
      </div>

      <LoginModal
        open={isModalOpen}
        setOpen={setIsModalOpen}
        initialMode="login"
      />  
    </div>
  );
};

export default Navbar;
