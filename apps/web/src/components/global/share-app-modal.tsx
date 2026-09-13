"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { IoCopy } from "react-icons/io5";
import { FaWhatsappSquare, FaFacebookSquare } from "react-icons/fa";
import { FaSquareXTwitter } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import { toast } from "sonner";
import Image from "next/image";
import { useTranslation } from "@beautonomi/i18n";
import GooglePlayStore from '../../../public/images/playstore-svgrepo-com.svg';
import Apple from '../../../public/images/apple-173-svgrepo-com.svg';
import { getDefaultPublicAppsResponse, NATIVE_STORE } from "@/lib/store/native-app-store";
import { getOsTypeFromNavigator } from "@/lib/utils/os-type";

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type StoreDownloadInfo =
  | { name: string; url: string; iconSrc: typeof Apple | typeof GooglePlayStore }
  | { name: string; url: string; iconKind: "huawei" };

export default function ShareAppModal({ isOpen, onClose }: ShareAppModalProps) {
  const { t } = useTranslation();
  const prefix = "web.global.shareAppModal";
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "huawei" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => {
        const url = window.location.origin;
        setCurrentUrl(url);
        const os = getOsTypeFromNavigator(window.navigator);
        if (os === "ios" || os === "android" || os === "huawei") {
          setPlatform(os);
        }
      });
    }
  }, []);

  const getStoreInfo = (): StoreDownloadInfo | null => {
    if (platform === "ios") {
      return {
        name: t(`${prefix}.appStore`),
        iconSrc: Apple,
        url: NATIVE_STORE.customer.defaultAppStoreUrl,
      };
    }
    if (platform === "huawei") {
      return {
        name: t(`${prefix}.huaweiAppGallery`),
        iconKind: "huawei",
        url: getDefaultPublicAppsResponse().customer.huawei.app_gallery_url,
      };
    }
    if (platform === "android") {
      return {
        name: t(`${prefix}.googlePlay`),
        iconSrc: GooglePlayStore,
        url: NATIVE_STORE.customer.defaultPlayStoreUrl,
      };
    }
    return null;
  };

  const storeInfo = getStoreInfo();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success(t(`${prefix}.copySuccess`));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t(`${prefix}.copyFailed`));
    }
  };

  const handleEmailShare = () => {
    const store = storeInfo
      ? t(`${prefix}.emailStoreLine`, { name: storeInfo.name, url: storeInfo.url })
      : "";
    const subject = encodeURIComponent(t(`${prefix}.emailSubject`));
    const body = encodeURIComponent(t(`${prefix}.emailBody`, { url: currentUrl, store }));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleWhatsAppShare = () => {
    const store = storeInfo ? t(`${prefix}.whatsappStoreLine`, { url: storeInfo.url }) : "";
    const text = encodeURIComponent(t(`${prefix}.whatsappText`, { url: currentUrl, store }));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleFacebookShare = () => {
    const url = encodeURIComponent(currentUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
  };

  const handleXShare = () => {
    const text = encodeURIComponent(t(`${prefix}.xText`));
    const url = encodeURIComponent(currentUrl);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, "_blank", "width=600,height=400");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-lg p-4 sm:p-6 z-[9999] rounded-none sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-normal">{t(`${prefix}.title`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4">
          <p className="text-gray-600">
            {t(`${prefix}.subtitle`)}
          </p>
          
          {storeInfo && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <p className="text-sm font-medium mb-2">{t(`${prefix}.downloadTheApp`)}</p>
              <Button
                onClick={() => window.open(storeInfo.url, '_blank')}
                className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
                size="lg"
              >
                {"iconSrc" in storeInfo ? (
                  <Image
                    src={storeInfo.iconSrc}
                    alt={storeInfo.name}
                    className="h-5 w-5 me-2"
                  />
                ) : (
                  <Smartphone className="h-5 w-5 me-2 shrink-0" aria-hidden />
                )}
                {t(`${prefix}.downloadFrom`, { name: storeInfo.name })}
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
              {copied ? t(`${prefix}.copied`) : t(`${prefix}.copyLink`)}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleEmailShare}
            >
              <span className="text-lg"><MdEmail/></span>
              {t(`${prefix}.email`)}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleWhatsAppShare}
            >
              <span className="text-lg"><FaWhatsappSquare/></span>
              {t(`${prefix}.whatsapp`)}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleFacebookShare}
            >
              <span className="text-lg"><FaFacebookSquare/></span>
              {t(`${prefix}.facebook`)}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl"
              onClick={handleXShare}
            >
              <span className="text-lg"><FaSquareXTwitter/></span>
              {t(`${prefix}.x`)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
