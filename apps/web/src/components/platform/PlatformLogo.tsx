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

  // Use platform logo if available, otherwise fallback to default (normalize null to fallback)
  const logoUrl = branding?.logo_url ?? logo;
  const safeLogoUrl: string | typeof logo = (logoUrl ?? "/images/logo.svg") ?? "/images/logo.svg";

  // Determine if it's an external URL
  const isExternalUrl = typeof safeLogoUrl === "string" && (safeLogoUrl.startsWith("http://") || safeLogoUrl.startsWith("https://"));

  // Determine if it's an imported image object (has src property) or a string path
  const isImportedImage = typeof safeLogoUrl === "object" && safeLogoUrl !== null && "src" in safeLogoUrl;
  
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
        src={safeLogoUrl as string}
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
        src={safeLogoUrl as any}
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
      src={safeLogoUrl as string}
      alt={alt}
      className={className}
      width={defaultWidth}
      height={defaultHeight}
      priority={priority}
    />
  );
}
