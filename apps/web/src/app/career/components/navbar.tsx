'use client'
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "./../../../../public/images/Group 3.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Sidebar from './../../../../public/images/sidebar-icon.svg';
import closeIcon from './../../../../public/images/close-icon.svg';

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
        <div className="mb-6 relative flex md:hidden justify-between items-center w-full mx-auto py-1 pl-3 pr-2 shadow rounded-full bg-white">
          <Input
            type="text"
            placeholder="Start your search"
            className="flex-grow outline-none text-base font-normal  px-4 border-none bg-transparent rounded-full transition-colors duration-300"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <Button className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] p-2">
              <SearchIcon className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>
        <Link href="/career" className="text-lg font-normal">Life at Beautonomi</Link>
        <Link href="/career/positions" className="text-lg font-normal">Job Search</Link>
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
        <div className="flex items-center space-x-2 w-44 h-20">
          <Image src={Logo} alt="Logo" className="object-cover" />
        </div>
        <div className="flex md:hidden">
          <button onClick={toggleMobileMenu}>
            <Image src={Sidebar} alt="Menu" />
          </button>
        </div>
        <div className="relative hidden md:flex justify-between items-center w-full max-w-xs mx-auto py-1 pl-3 pr-2 shadow rounded-full bg-white">
          <Input
            type="text"
            placeholder="Start your search"
            className="flex-grow outline-none text-base font-normal  px-4 border-none bg-transparent rounded-full transition-colors duration-300"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <Button className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] p-2">
              <SearchIcon className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Link href="/career" className="text-sm font-normal text-black">
            Life at Beautonomi
          </Link>
          <Link
            href="/career/positions"
            className="flex items-center text-sm font-normal text-black"
          >
            Job Search
            <ChevronDownIcon className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </header>
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
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

const SearchIcon: React.FC<IconProps> = (props) => (
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
