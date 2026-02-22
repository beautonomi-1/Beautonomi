"use client";

import { useEffect } from "react";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";

/**
 * Component that applies dynamic branding (colors and favicon) to the page
 * Should be placed in the root layout
 */
export default function DynamicBranding() {
  const { branding } = usePlatformSettings();

  useEffect(() => {
    if (!branding) return;

    // Apply CSS custom properties for colors
    const root = document.documentElement;
    
    // Convert hex colors to RGB for CSS variables
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : null;
    };

    // Set primary color
    const primaryRgb = hexToRgb(branding.primary_color);
    if (primaryRgb) {
      root.style.setProperty("--brand-primary", branding.primary_color);
      root.style.setProperty("--brand-primary-rgb", `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
    }

    // Set secondary color
    const secondaryRgb = hexToRgb(branding.secondary_color);
    if (secondaryRgb) {
      root.style.setProperty("--brand-secondary", branding.secondary_color);
      root.style.setProperty("--brand-secondary-rgb", `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
    }

    // Update favicon
    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = branding.favicon_url || "/images/favicon.ico";

    // Update apple-touch-icon if needed
    let appleIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (branding.favicon_url && !appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    if (appleIcon && branding.favicon_url) {
      appleIcon.href = branding.favicon_url;
    }

    // Update site title
    if (branding.site_name) {
      document.title = `${branding.site_name} - Beauty Service Marketplace`;
    }
  }, [branding]);

  return null;
}
