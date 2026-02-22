"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IoCopy } from "react-icons/io5";
import { FaWhatsappSquare, FaFacebookSquare } from "react-icons/fa";
import { FaSquareXTwitter } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import { toast } from "sonner";
import Image from "next/image";
import GooglePlayStore from '../../../public/images/playstore-svgrepo-com.svg';
import Apple from '../../../public/images/apple-173-svgrepo-com.svg';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareAppModal({ isOpen, onClose }: ShareAppModalProps) {
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => {
        const url = window.location.origin;
        setCurrentUrl(url);
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
          setPlatform('ios');
        } else if (userAgent.includes('android')) {
          setPlatform('android');
        }
      });
    }
  }, []);

  const getStoreInfo = () => {
    if (platform === 'ios') {
      return {
        name: 'App Store',
        icon: Apple,
        url: 'https://apps.apple.com/app/beautonomi',
      };
    } else if (platform === 'android') {
      return {
        name: 'Google Play Store',
        icon: GooglePlayStore,
        url: 'https://play.google.com/store/apps/details?id=com.beautonomi',
      };
    }
    return null;
  };

  const storeInfo = getStoreInfo();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent("Check out Beautonomi - Beauty Services Marketplace");
    const body = encodeURIComponent(`I found this amazing app for booking beauty services:\n\n${currentUrl}\n\n${storeInfo ? `Download on ${storeInfo.name}: ${storeInfo.url}` : ''}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Check out Beautonomi - the best way to book beauty services! ${currentUrl} ${storeInfo ? `Download: ${storeInfo.url}` : ''}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleFacebookShare = () => {
    const url = encodeURIComponent(currentUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent("Check out Beautonomi - Beauty Services Marketplace");
    const url = encodeURIComponent(currentUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "width=600,height=400");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-lg p-4 sm:p-6 z-[9999] rounded-none sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-normal">Share Beautonomi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4">
          <p className="text-gray-600">
            Help your friends discover the best beauty services in their area!
          </p>
          
          {storeInfo && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <p className="text-sm font-medium mb-2">Download the App</p>
              <Button
                onClick={() => window.open(storeInfo.url, '_blank')}
                className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
                size="lg"
              >
                <Image
                  src={storeInfo.icon}
                  alt={storeInfo.name}
                  className="h-5 w-5 mr-2"
                />
                Download from {storeInfo.name}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleCopyLink}
            >
              <span className="text-lg"><IoCopy/></span>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleEmailShare}
            >
              <span className="text-lg"><MdEmail/></span>
              Email
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleWhatsAppShare}
            >
              <span className="text-lg"><FaWhatsappSquare/></span>
              WhatsApp
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleFacebookShare}
            >
              <span className="text-lg"><FaFacebookSquare/></span>
              Facebook
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleTwitterShare}
            >
              <span className="text-lg"><FaSquareXTwitter/></span>
              Twitter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
