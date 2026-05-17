import React from "react";
import Image, { type ImageProps } from "next/image";
import { PROVIDER_GALLERY_OBJECT_POSITION } from "@beautonomi/utils";

const FRAME_CLASS =
  "relative w-full aspect-video overflow-hidden bg-gray-100";
const IMAGE_CLASS = "object-cover";

export type ProviderGalleryImageProps = {
  src: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  priority?: boolean;
  loading?: ImageProps["loading"];
  sizes?: string;
};

/**
 * Landscape gallery tile: fixed 16:9 frame, cover crop, center-weighted focus.
 */
export function ProviderGalleryImage({
  src,
  alt,
  className,
  frameClassName,
  priority,
  loading,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: ProviderGalleryImageProps) {
  return (
    <div className={[FRAME_CLASS, frameClassName, className].filter(Boolean).join(" ")}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={IMAGE_CLASS}
        style={{ objectPosition: PROVIDER_GALLERY_OBJECT_POSITION }}
        priority={priority}
        loading={loading}
      />
    </div>
  );
}
