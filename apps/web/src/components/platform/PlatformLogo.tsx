"use client";

import Image from "next/image";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import logo from "../../../public/images/logo.svg"; // Fallback logo

interface PlatformLogoProps {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export default function PlatformLogo({
  className = "",
  alt = "Logo",
  width,
  height,
  priority = false,
}: PlatformLogoProps) {
  const { branding, isLoading } = usePlatformSettings();

  // Use platform logo if available, otherwise fallback to default
  const logoUrl = branding?.logo_url || logo;
  
  // Determine if it's an external URL
  const isExternalUrl = typeof logoUrl === "string" && (logoUrl.startsWith("http://") || logoUrl.startsWith("https://"));
  
  // Determine if it's an imported image object (has src property) or a string path
  const isImportedImage = typeof logoUrl === "object" && logoUrl !== null && "src" in logoUrl;
  
  // Default dimensions if not provided (w-44 = 176px, typical logo aspect ratio)
  const defaultWidth = width || 176;
  const defaultHeight = height || 80;

  if (isLoading) {
    // Show fallback while loading
    return (
      <Image
        src={logo}
        alt={alt}
        className={className}
        width={defaultWidth}
        height={defaultHeight}
        priority={priority}
      />
    );
  }

  if (isExternalUrl) {
    // For external URLs, use regular img tag
    return (
      <img
        src={logoUrl as string}
        alt={alt}
        className={className}
        width={defaultWidth}
        height={defaultHeight}
        style={{ 
          width: width ? `${width}px` : undefined, 
          height: height ? `${height}px` : "auto",
          maxWidth: "100%",
        }}
      />
    );
  }

  // For imported images (from imports), use Next.js Image directly
  if (isImportedImage) {
    return (
      <Image
        src={logoUrl as any}
        alt={alt}
        className={className}
        width={defaultWidth}
        height={defaultHeight}
        priority={priority}
      />
    );
  }

  // For local string paths (starting with /), use Next.js Image with required dimensions
  return (
    <Image
      src={logoUrl as string}
      alt={alt}
      className={className}
      width={defaultWidth}
      height={defaultHeight}
      priority={priority}
    />
  );
}
