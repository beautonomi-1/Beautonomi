"use client";

import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";

interface BrandColorProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * Component that applies brand colors dynamically
 * Use this wrapper for elements that should use brand colors
 */
export default function BrandColor({
  children,
  className = "",
  style = {},
  as: Component = "div",
}: BrandColorProps) {
  const { branding } = usePlatformSettings();

  const brandStyle: React.CSSProperties = {
    ...style,
    color: branding?.primary_color || style.color,
  };

  return (
    <Component className={className} style={brandStyle}>
      {children}
    </Component>
  );
}

/**
 * Utility function to get brand color classes
 * Use this for Tailwind classes that need brand colors
 */
export function useBrandColors() {
  const { branding } = usePlatformSettings();
  return {
    primary: branding?.primary_color || "#FF0077",
    secondary: branding?.secondary_color || "#D60565",
  };
}
