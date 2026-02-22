"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { IoCopy } from "react-icons/io5";
import { FaWhatsappSquare, FaFacebookSquare } from "react-icons/fa";
import { FaSquareXTwitter } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import { BiSolidMessageSquareDetail } from "react-icons/bi";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  experienceTitle?: string;
  experienceImage?: string;
  shareUrl?: string;
}

export default function ShareModal({ 
  isOpen, 
  onClose, 
  experienceTitle = "Beautonomi Experience",
  experienceImage = "/images/logo-beatonomi.svg",
  shareUrl
}: ShareModalProps) {
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Ensure image URL is absolute for better social media previews
  const getAbsoluteImageUrl = (imageUrl: string | undefined): string => {
    if (!imageUrl) return "/images/logo-beatonomi.svg";
    
    // If already absolute, return as is
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }
    
    // If relative, make it absolute
    if (typeof window !== "undefined") {
      const baseUrl = window.location.origin;
      return imageUrl.startsWith("/") 
        ? `${baseUrl}${imageUrl}`
        : `${baseUrl}/${imageUrl}`;
    }
    
    // Fallback for SSR
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
    return imageUrl.startsWith("/") 
      ? `${siteUrl}${imageUrl}`
      : `${siteUrl}/${imageUrl}`;
  };

  const absoluteImageUrl = getAbsoluteImageUrl(experienceImage);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = shareUrl || window.location.href;
      queueMicrotask(() => setCurrentUrl(url));
    }
  }, [shareUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = currentUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Failed to copy link");
      }
      document.body.removeChild(textArea);
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Check out ${experienceTitle} on Beautonomi`);
    const body = encodeURIComponent(`I found this on Beautonomi:\n\n${experienceTitle}\n\n${currentUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Check out ${experienceTitle} on Beautonomi: ${currentUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleFacebookShare = () => {
    const url = encodeURIComponent(currentUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(`Check out ${experienceTitle} on Beautonomi`);
    const url = encodeURIComponent(currentUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "width=600,height=400");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: experienceTitle,
          text: `Check out ${experienceTitle} on Beautonomi`,
          url: currentUrl,
        });
      } catch {
        // User cancelled or error occurred
        console.log("Share cancelled or failed");
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 z-[9999] border-0 bg-transparent shadow-none">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="backdrop-blur-2xl bg-white/90 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <DialogHeader className="flex justify-start mb-6">
                <DialogTitle className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900">
                  Share {experienceTitle}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Share this with others via various platforms
                </DialogDescription>
              </DialogHeader>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex gap-4 items-center mb-6 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/40"
              >
                <Image
                  src={absoluteImageUrl}
                  alt={experienceTitle}
                  width={80}
                  height={80}
                  className="rounded-xl object-cover flex-shrink-0"
                  unoptimized={absoluteImageUrl.startsWith("http")} // Don't optimize external URLs
                />
                <p className="text-base md:text-lg font-medium text-gray-900 line-clamp-2">{experienceTitle}</p>
              </motion.div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full flex items-center justify-start px-4 gap-3 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl h-12 transition-all"
                    onClick={handleCopyLink}
                  >
                    <span className="text-xl"><IoCopy/></span>
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full flex items-center justify-start px-4 gap-3 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl h-12 transition-all"
                    onClick={handleEmailShare}
                  >
                    <span className="text-xl"><MdEmail/></span>
                    Email
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full flex items-center justify-start px-4 gap-3 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl h-12 transition-all"
                    onClick={handleWhatsAppShare}
                  >
                    <span className="text-xl text-green-600"><FaWhatsappSquare/></span>
                    WhatsApp
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full flex items-center justify-start px-4 gap-3 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl h-12 transition-all"
                    onClick={handleFacebookShare}
                  >
                    <span className="text-xl text-blue-600"><FaFacebookSquare/></span>
                    Facebook
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    variant="outline" 
                    className="w-full flex items-center justify-start px-4 gap-3 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl h-12 transition-all"
                    onClick={handleTwitterShare}
                  >
                    <span className="text-xl"><FaSquareXTwitter/></span>
                    Twitter
                  </Button>
                </motion.div>
              </div>

              {navigator.share && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 pt-4 border-t border-gray-200"
                >
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 h-12 font-medium hover:bg-pink-50 hover:border-[#FF0077] hover:text-[#FF0077] rounded-xl transition-all"
                      onClick={handleNativeShare}
                    >
                      <BiSolidMessageSquareDetail className="text-lg" />
                      Share via...
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}