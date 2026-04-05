"use client";

import Image from "next/image";
import { Smartphone } from "lucide-react";
import GooglePlayStore from "../../../public/images/playstore-svgrepo-com.svg";
import AppleStore from "../../../public/images/apple-173-svgrepo-com.svg";

export type DownloadBannerStore = "ios" | "android" | "huawei";

type MobileProps = {
  variant: "mobile";
  linkUrl: string;
  ctaLabel: string;
  store: DownloadBannerStore;
  onDismiss: () => void;
  onTrackClick: () => void;
};

type DesktopProps = {
  variant: "desktop";
  headline: string;
  iosUrl: string | null;
  androidUrl: string | null;
  huaweiUrl: string | null;
  onDismiss: () => void;
  onStoreClick: (store: DownloadBannerStore, url: string) => void;
};

export type DownloadBannerProps = MobileProps | DesktopProps;

function StoreIcon({ store, className }: { store: DownloadBannerStore; className?: string }) {
  if (store === "ios") {
    return (
      <Image src={AppleStore} alt="" className={className ?? "h-6 w-6 shrink-0"} aria-hidden />
    );
  }
  if (store === "android") {
    return (
      <Image src={GooglePlayStore} alt="" className={className ?? "h-6 w-6 shrink-0"} aria-hidden />
    );
  }
  return <Smartphone className={className ?? "h-6 w-6 shrink-0 text-white"} aria-hidden />;
}

export default function DownloadBanner(props: DownloadBannerProps) {
  if (props.variant === "mobile") {
    const { linkUrl, ctaLabel, store, onDismiss, onTrackClick } = props;
    const handleClick = () => {
      onTrackClick();
      window.open(linkUrl, "_blank", "noopener,noreferrer");
    };

    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        role="banner"
        aria-label="Download app"
      >
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            handleClick();
          }}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
        >
          <StoreIcon store={store} className="h-6 w-6 shrink-0 brightness-0 invert" />
          <span className="truncate">{ctaLabel}</span>
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          aria-label="Dismiss banner"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  const { headline, iosUrl, androidUrl, huaweiUrl, onDismiss, onStoreClick } = props;

  const chips: { store: DownloadBannerStore; url: string; label: string }[] = [];
  if (iosUrl) chips.push({ store: "ios", url: iosUrl, label: "App Store" });
  if (androidUrl) chips.push({ store: "android", url: androidUrl, label: "Google Play" });
  if (huaweiUrl) chips.push({ store: "huawei", url: huaweiUrl, label: "AppGallery" });

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex flex-col gap-2 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="banner"
      aria-label="Download app"
    >
      <p className="text-sm font-medium text-gray-900 sm:max-w-[min(20rem,40%)] sm:shrink-0">{headline}</p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {chips.map(({ store, url, label }) => (
          <a
            key={store}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              onStoreClick(store, url);
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            <StoreIcon store={store} className="h-5 w-5 shrink-0" />
            <span>{label}</span>
          </a>
        ))}
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          aria-label="Dismiss banner"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
