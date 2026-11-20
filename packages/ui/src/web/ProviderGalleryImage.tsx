import React from "react";
import Image, { type ImageProps } from "next/image";
import { PROVIDER_GALLERY_OBJECT_POSITION } from "@beautonomi/utils";

const FRAME_ASPECT_CLASS =
  "relative w-full aspect-[4/5] overflow-hidden bg-gray-100";
const FRAME_FILL_HEIGHT_CLASS =
  "relative h-full w-full overflow-hidden bg-gray-100";
const IMAGE_CLASS = "object-cover";

export type ProviderGalleryImageProps = {
  src: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  /** When true, fill parent height instead of 4:5 aspect (desktop hero mosaic). */
  fillHeight?: boolean;
  priority?: boolean;
  loading?: ImageProps["loading"];
  sizes?: string;
};

/**
 * Portrait gallery tile: fixed 4:5 frame, cover crop, center-weighted focus.
 */
export function ProviderGalleryImage({
  src,
  alt,
  className,
  frameClassName,
  fillHeight = false,
  priority,
  loading,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: ProviderGalleryImageProps) {
  const frameClass = fillHeight ? FRAME_FILL_HEIGHT_CLASS : FRAME_ASPECT_CLASS;
  return (
    <div className={[frameClass, frameClassName, className].filter(Boolean).join(" ")}>
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
