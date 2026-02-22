"use client";

/**
 * Lazy Image Component
 * 
 * Optimized image component with lazy loading and Next.js Image optimization.
 * Falls back to regular img tag if Next.js Image is not available.
 * 
 * @module components/ui/lazy-image
 */

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LazyImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional width (required for Next.js Image) */
  width?: number;
  /** Optional height (required for Next.js Image) */
  height?: number;
  /** Optional className */
  className?: string;
  /** Optional object fit */
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  /** Optional priority loading (loads immediately) */
  priority?: boolean;
  /** Optional placeholder (blur, empty, or data URL) */
  placeholder?: "blur" | "empty";
  /** Optional blur data URL for placeholder */
  blurDataURL?: string;
  /** Optional fill mode (fills parent container) */
  fill?: boolean;
  /** Optional sizes for responsive images */
  sizes?: string;
  /** Optional onLoad callback */
  onLoad?: () => void;
  /** Optional onError callback */
  onError?: () => void;
}

export function LazyImage({
  src,
  alt,
  width,
  height,
  className,
  objectFit = "cover",
  priority = false,
  placeholder = "empty",
  blurDataURL,
  fill = false,
  sizes,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "50px", // Start loading 50px before entering viewport
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [priority, isInView]);

  const handleLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
  };

  // If error, show placeholder
  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-100 text-gray-400",
          className
        )}
        style={!fill && width && height ? { width, height } : undefined}
      >
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }

  // Show skeleton while loading
  if (isLoading && !isInView) {
    return (
      <Skeleton
        className={cn("bg-gray-200", className)}
        style={!fill && width && height ? { width, height } : undefined}
      />
    );
  }

  // Use Next.js Image if dimensions are provided or fill is true
  if (fill || (width && height)) {
    return (
      <div ref={imgRef} className={cn("relative", className)}>
        {isLoading && (
          <Skeleton
            className="absolute inset-0 bg-gray-200"
            style={fill ? undefined : { width, height }}
          />
        )}
        {isInView && (
          <Image
            src={src}
            alt={alt}
            width={fill ? undefined : width}
            height={fill ? undefined : height}
            fill={fill}
            className={cn(
              "transition-opacity duration-300",
              isLoading ? "opacity-0" : "opacity-100",
              objectFit === "cover" && "object-cover",
              objectFit === "contain" && "object-contain",
              objectFit === "fill" && "object-fill",
              objectFit === "none" && "object-none",
              objectFit === "scale-down" && "object-scale-down"
            )}
            priority={priority}
            placeholder={placeholder}
            blurDataURL={blurDataURL}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    );
  }

  // Fallback to regular img tag
  return (
    <div ref={imgRef} className={cn("relative", className)}>
      {isLoading && <Skeleton className="absolute inset-0 bg-gray-200" />}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={cn(
            "transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100",
            objectFit === "cover" && "object-cover",
            objectFit === "contain" && "object-contain",
            objectFit === "fill" && "object-fill",
            objectFit === "none" && "object-none",
            objectFit === "scale-down" && "object-scale-down"
          )}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
        />
      )}
    </div>
  );
}
