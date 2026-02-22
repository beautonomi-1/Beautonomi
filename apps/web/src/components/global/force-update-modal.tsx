"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Image from "next/image";
import GooglePlayStore from '../../../public/images/playstore-svgrepo-com.svg';
import Apple from '../../../public/images/apple-173-svgrepo-com.svg';

interface ForceUpdateModalProps {
  isOpen: boolean;
  platform: 'ios' | 'android';
  minVersion: string;
  currentVersion?: string;
  updateUrl?: string;
}

export default function ForceUpdateModal({
  isOpen,
  platform,
  minVersion,
  currentVersion,
  updateUrl,
}: ForceUpdateModalProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setIsClient(true));
  }, []);

  const getStoreInfo = () => {
    if (platform === 'ios') {
      return {
        name: 'App Store',
        icon: Apple,
        defaultUrl: updateUrl || 'https://apps.apple.com/app/beautonomi',
        buttonText: 'Update from App Store'
      };
    } else {
      return {
        name: 'Google Play Store',
        icon: GooglePlayStore,
        defaultUrl: updateUrl || 'https://play.google.com/store/apps/details?id=com.beautonomi',
        buttonText: 'Update from Google Play'
      };
    }
  };

  const storeInfo = getStoreInfo();

  if (!isClient) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md z-[9999]" hideClose>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-orange-500" />
            <DialogTitle className="text-2xl font-semibold">
              Update Required
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-600">
            A new version of Beautonomi is available. Please update to continue using the app.
          </p>
          {currentVersion && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Current version:</span> {currentVersion}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Required version:</span> {minVersion} or higher
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                if (storeInfo.defaultUrl) {
                  window.open(storeInfo.defaultUrl, '_blank');
                }
              }}
              className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
              size="lg"
            >
              <Image
                src={storeInfo.icon}
                alt={storeInfo.name}
                className="h-5 w-5 mr-2"
              />
              {storeInfo.buttonText}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              After updating, please restart the app
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
