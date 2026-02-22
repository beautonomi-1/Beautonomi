"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, X, Smartphone, ExternalLink } from "lucide-react";
import Image from "next/image";
import { fetcher } from "@/lib/http/fetcher";
import GooglePlayStore from '../../../public/images/playstore-svgrepo-com.svg';
import Apple from '../../../public/images/apple-173-svgrepo-com.svg';

interface RateUsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppStoreInfo {
  name: string;
  icon: any;
  url: string;
  buttonText: string;
  platform: 'ios' | 'android' | 'huawei';
}

export default function RateUsModal({ isOpen, onClose }: RateUsModalProps) {
  const [_platform, setPlatform] = useState<'ios' | 'android' | 'huawei' | null>(null);
  const [appStoreInfo, setAppStoreInfo] = useState<AppStoreInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableStores, setAvailableStores] = useState<AppStoreInfo[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      // Detect platform
      const userAgent = window.navigator.userAgent.toLowerCase();
      let detectedPlatform: 'ios' | 'android' | 'huawei' | null = null;
      
      if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        detectedPlatform = 'ios';
      } else if (userAgent.includes('huawei') || userAgent.includes('honor')) {
        detectedPlatform = 'huawei';
      } else if (userAgent.includes('android')) {
        detectedPlatform = 'android';
      }
      
      setPlatform(detectedPlatform);
      loadAppStoreUrls(detectedPlatform);
    }
  }, [isOpen]);

  const loadAppStoreUrls = async (detectedPlatform: 'ios' | 'android' | 'huawei' | null) => {
    try {
      setIsLoading(true);
      
      // Fetch app store URLs from API
      // Use try-catch to handle errors gracefully without throwing
      let apps: any = null;
      try {
        const response = await fetcher.get<{ data: any }>('/api/public/apps?type=customer');
        apps = response.data;
      } catch (fetchError) {
        // Silently fall back to defaults if API fails
        console.warn('Could not fetch app settings, using defaults:', fetchError);
        apps = null; // Will trigger fallback logic below
      }
      
      // If no apps data, use fallback defaults
      if (!apps) {
        apps = {
          ios: {
            enabled: true,
            app_store_url: 'https://apps.apple.com/app/beautonomi-customer',
          },
          android: {
            enabled: true,
            package_name: 'com.beautonomi.customer',
            download_url: 'https://play.google.com/store/apps/details?id=com.beautonomi.customer',
          },
          huawei: {
            enabled: false,
          },
        };
      }
      
      const stores: AppStoreInfo[] = [];
      
      // iOS App Store
      if (apps?.ios?.enabled && apps.ios.app_store_url) {
        stores.push({
          name: 'App Store',
          icon: Apple,
          url: apps.ios.app_store_url,
          buttonText: 'Rate on App Store',
          platform: 'ios'
        });
      }
      
      // Google Play Store
      if (apps?.android?.enabled) {
        // For ratings, we need Play Store URL format
        // If download_url is already a Play Store URL, use it; otherwise construct from package_name
        let playStoreUrl = apps.android.download_url;
        
        if (!playStoreUrl || !playStoreUrl.includes('play.google.com')) {
          // Construct Play Store rating URL from package_name
          const packageName = apps.android.package_name || 'com.beautonomi';
          playStoreUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
        }
        
        stores.push({
          name: 'Google Play Store',
          icon: GooglePlayStore,
          url: playStoreUrl,
          buttonText: 'Rate on Google Play',
          platform: 'android'
        });
      }
      
      // Huawei AppGallery
      if (apps?.huawei?.enabled && apps.huawei.app_gallery_url) {
        stores.push({
          name: 'Huawei AppGallery',
          icon: Smartphone, // Use Smartphone icon as fallback for Huawei
          url: apps.huawei.app_gallery_url,
          buttonText: 'Rate on AppGallery',
          platform: 'huawei'
        });
      }
      
      setAvailableStores(stores);
      
      // Set the store info based on detected platform, or default to first available
      if (detectedPlatform) {
        const platformStore = stores.find(s => s.platform === detectedPlatform);
        if (platformStore) {
          setAppStoreInfo(platformStore);
        } else if (stores.length > 0) {
          setAppStoreInfo(stores[0]);
        }
      } else if (stores.length > 0) {
        setAppStoreInfo(stores[0]);
      }
      
    } catch {
      // Silent fallback - don't log errors to console as they're expected in some cases
      // Fallback to default URLs
      const fallbackStore: AppStoreInfo = detectedPlatform === 'ios' 
        ? {
            name: 'App Store',
            icon: Apple,
            url: 'https://apps.apple.com/app/beautonomi-customer',
            buttonText: 'Rate on App Store',
            platform: 'ios'
          }
        : {
            name: 'Google Play Store',
            icon: GooglePlayStore,
            url: 'https://play.google.com/store/apps/details?id=com.beautonomi.customer',
            buttonText: 'Rate on Google Play',
            platform: 'android'
          };
      setAppStoreInfo(fallbackStore);
      setAvailableStores([fallbackStore]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRate = () => {
    if (appStoreInfo) {
      window.open(appStoreInfo.url, '_blank', 'noopener,noreferrer');
      onClose();
    }
  };

  const handleStoreSelect = (store: AppStoreInfo) => {
    setAppStoreInfo(store);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-lg z-[9999] p-0 border-0 bg-transparent shadow-none">
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
          >
            <X className="w-5 h-5" />
          </button>

          <DialogHeader className="text-center mb-6">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <DialogTitle className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 mb-2">
                Enjoying Beautonomi?
              </DialogTitle>
              <p className="text-sm md:text-base font-light text-gray-600 mt-2">
                Your feedback helps us improve! Please take a moment to rate us on the {appStoreInfo?.name || 'App Store'}.
              </p>
            </motion.div>
          </DialogHeader>

          {/* Stars */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center gap-1 mb-6"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.div
                key={star}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + star * 0.05 }}
                whileHover={{ scale: 1.2, rotate: 10 }}
              >
                <Star className="h-8 w-8 md:h-10 md:w-10 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
              </motion.div>
            ))}
          </motion.div>

          {/* Store Selection (if multiple stores available) */}
          {availableStores.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <p className="text-xs font-medium text-gray-500 mb-3 text-center">Select your app store:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {availableStores.map((store) => (
                  <motion.button
                    key={store.platform}
                    onClick={() => handleStoreSelect(store)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                      appStoreInfo?.platform === store.platform
                        ? 'bg-pink-50 border-[#FF0077] text-[#FF0077]'
                        : 'bg-white/60 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Image
                      src={store.icon}
                      alt={store.name}
                      className="h-4 w-4"
                      width={16}
                      height={16}
                    />
                    <span className="text-xs font-medium">{store.name}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {appStoreInfo && !isLoading ? (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleRate}
                  className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white shadow-lg h-12 text-base font-semibold"
                  size="lg"
                >
                  <Image
                    src={appStoreInfo.icon}
                    alt={appStoreInfo.name}
                    className="h-5 w-5 mr-2"
                    width={20}
                    height={20}
                  />
                  {appStoreInfo.buttonText}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            ) : (
              <Button
                disabled
                className="w-full bg-gray-200 text-gray-400 cursor-not-allowed h-12"
                size="lg"
              >
                <Smartphone className="w-5 h-5 mr-2 animate-pulse" />
                Loading...
              </Button>
            )}
            
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full border-gray-200 hover:bg-gray-50 text-gray-700 h-12 text-base font-medium"
                size="lg"
              >
                Maybe Later
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
