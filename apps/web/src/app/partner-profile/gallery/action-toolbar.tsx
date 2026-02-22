'use client'
import Image from "next/image";
import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import SaveArrow from "../../../../public/images/save-arrow.svg";
import HeartIcon from "./../../../../public/images/heart.svg";
import Arrow from "./../../../../public/images/left-arrow.svg";
import Link from "next/link";
import LoginModal from "@/components/global/login-modal";
import ShareModal from "@/app/home/components/share-modal";

const actionItems = [
  {
    icon: SaveArrow,
    label: "Share",
  },
  {
    icon: HeartIcon,
    label: "Save",
  },
];

const ActionToolbar = () => {
  const searchParams = useSearchParams();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Get slug from URL to construct back link
  const slugParam = searchParams.get("slug") || searchParams.get("partnerId");
  const slug = slugParam ? decodeURIComponent(slugParam) : null;
  const backHref = slug ? `/partner-profile?slug=${encodeURIComponent(slug)}` : "/partner-profile";

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsShareModalOpen(false);
  };

  const handleHeartClick = () => {
    setIsLoginModalOpen(true);
  };
  return (
    <div className="sticky top-0 z-10">
      <div className="bg-white py-6">
        <div className="container">
          <div className="flex justify-between items-center">
            <Link href={backHref}>
            <Image src={Arrow} alt="Back" />
            </Link>
            <div className="flex gap-2">
            {actionItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-2 items-center hover:bg-primary p-2 rounded-lg cursor-pointer"
                onClick={
                  item.label === "Share" ? handleShareClick : handleHeartClick
                }
              >
                <Image src={item.icon} alt={item.label} className="h-5 w-5" />
                <p className="underline text-sm font-normal">{item.label}</p>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseModal}
        experienceTitle="Provider Gallery"
        experienceImage="/images/logo-beatonomi.svg"
        shareUrl={
          typeof window !== "undefined" 
            ? slug 
              ? `${window.location.origin}/partner-profile?slug=${encodeURIComponent(slug)}`
              : window.location.href
            : undefined
        }
      />

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
};

export default ActionToolbar;
