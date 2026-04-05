"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "./../../../../public/images/Group 3.svg";
import Sidebar from "./../../../../public/images/sidebar-icon.svg";
import closeIcon from "./../../../../public/images/close-icon.svg";
import { usePageContent } from "@/lib/cms/usePageContent";
import {
  DEFAULT_CAREERS_PORTAL_URL,
  validateCareersPortalUrl,
} from "@/lib/cms/career-cms-constants";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  openRolesHref: string;
}

const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  openRolesHref,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white md:hidden">
      <div className="flex justify-end p-4">
        <button type="button" onClick={onClose} aria-label="Close menu">
          <Image src={closeIcon} alt="Close" />
        </button>
      </div>
      <nav className="container mt-8 flex flex-col space-y-4">
        <Link
          href="/career#life-at"
          className="text-lg font-normal"
          onClick={onClose}
        >
          Life at Beautonomi
        </Link>
        <Link
          href={openRolesHref}
          className="text-lg font-normal"
          onClick={onClose}
          {...(openRolesHref.startsWith("http")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          Open roles
        </Link>
      </nav>
    </div>
  );
};

export default function CareerNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const { getSectionContent } = usePageContent("career");

  const validated = validateCareersPortalUrl(
    getSectionContent("careers_portal_url"),
  );
  const openRolesHref = validated ?? DEFAULT_CAREERS_PORTAL_URL;

  return (
    <div className="sticky top-0 z-10 bg-white/95 px-6 py-4 backdrop-blur-sm">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex h-14 w-40 shrink-0 items-center">
          <Image src={Logo} alt="Beautonomi" className="object-contain" />
        </Link>
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Image src={Sidebar} alt="" />
          </button>
        </div>
        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="/career#life-at"
            className="text-sm font-medium text-neutral-800"
          >
            Life at Beautonomi
          </Link>
          <Link
            href={openRolesHref}
            className="text-sm font-medium text-neutral-800"
            {...(openRolesHref.startsWith("http")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            Open roles
          </Link>
        </nav>
      </header>
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        openRolesHref={openRolesHref}
      />
    </div>
  );
}
