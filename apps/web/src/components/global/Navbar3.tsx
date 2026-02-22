"use client";
import React, { useState } from "react";
import Image from "next/image";
import Logo from "./../../../public/images/Group 3.svg";
import Sidebar from "./../../../public/images/sidebar-icon.svg";
import closeIcon from "./../../../public/images/close-icon.svg";
import Link from "next/link";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 md:hidden">
      <div className="flex justify-end p-4">
        <Image onClick={onClose} src={closeIcon} alt="Close Menu" />
      </div>
      <nav className="flex flex-col container space-y-4 mt-8">
        <a href="#" className="text-lg font-normal">
          Life at Beautonomi
        </a>
        <a href="#" className="text-lg font-normal">
          Job Search
        </a>
      </nav>
    </div>
  );
};

export default function CareerNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="px-8 py-4 sticky top-0 z-10 bg-white">
      <header className="flex items-center justify-between bg-white ">
        <div className="flex items-center space-x-2  w-44 h-20">
        <Link href="/">
          <Image src={Logo} alt="Logo"className="object-cover" />
          </Link>
        </div>
        <div className="flex md:hidden">
          <button onClick={toggleMobileMenu}>
            <Image src={Sidebar} alt="Menu" />
          </button>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <a href="#" className="text-sm font-normal text-black">
            Life at Beautonomi
          </a>
          <a
            href="#"
            className="flex items-center text-sm font-normal text-black"
          >
            Job Search
            <ChevronDownIcon className="w-4 h-4 ml-1" />
          </a>
        </div>
      </header>
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
    </div>
  );
}

interface IconProps extends React.SVGProps<SVGSVGElement> {}

const ChevronDownIcon: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const _SearchIcon: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
