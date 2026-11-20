"use client";
import React from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";
import { ProviderGalleryImage } from "@beautonomi/ui/web";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";

interface PartnerPhotosProps {
  gallery?: string[];
  businessName?: string;
  slug?: string;
  onOpenPhoto?: (index: number) => void;
  onOpenAllPhotos?: () => void;
}

const PartnerPhotos: React.FC<PartnerPhotosProps> = ({
  gallery = [],
  businessName,
  slug,
  onOpenPhoto,
  onOpenAllPhotos,
}) => {
  const { pp } = usePartnerProfileT();
  const useDialog = Boolean(onOpenPhoto);

  const displayImages = React.useMemo(() => {
    if (!gallery || gallery.length === 0) return [];
    return gallery
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter((url) => url.length > 0)
      .map((url, idx) => ({
        src: url,
        alt: `${businessName || "Provider"} image ${idx + 1}`,
      }));
  }, [gallery, businessName]);

  const galleryHref = slug
    ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}`
    : "/partner-profile/gallery";

  const TileWrapper = ({
    index,
    className,
    children,
  }: {
    index: number;
    className?: string;
    children: React.ReactNode;
  }) => {
    if (useDialog && onOpenPhoto) {
      return (
        <button
          type="button"
          className={`block w-full cursor-pointer hover:opacity-90 transition-opacity overflow-hidden text-left ${className ?? ""}`}
          onClick={() => onOpenPhoto(index)}
          aria-label={pp("viewPhotoA11y", { index: index + 1, total: displayImages.length })}
        >
          {children}
        </button>
      );
    }
    return (
      <Link href={galleryHref} className={`block cursor-pointer hover:opacity-90 transition-opacity overflow-hidden ${className ?? ""}`}>
        {children}
      </Link>
    );
  };

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">{pp("tabPhotos")}</h2>

      {displayImages.length > 0 ? (
        <>
          <div className="hidden md:grid grid-cols-2 gap-2">
            <div className="row-span-2">
              <TileWrapper index={0} className="rounded-l-xl">
                <ProviderGalleryImage
                  src={displayImages[0].src}
                  alt={displayImages[0].alt}
                  priority
                />
              </TileWrapper>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {displayImages.slice(1, 5).map((image, index) => (
                <TileWrapper
                  key={index}
                  index={index + 1}
                  className={`${index === 1 ? "rounded-tr-xl" : ""} ${index === 3 ? "rounded-br-xl" : ""}`}
                >
                  <ProviderGalleryImage src={image.src} alt={image.alt} />
                </TileWrapper>
              ))}
            </div>
          </div>

          <div className="md:hidden grid grid-cols-2 gap-2">
            {displayImages.map((image, index) => (
              <TileWrapper key={index} index={index} className="rounded-lg">
                <ProviderGalleryImage src={image.src} alt={image.alt} />
              </TileWrapper>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title={pp("noPhotosAvailable")} description={pp("noPhotosHint")} />
      )}

      {displayImages.length > 0 && (
        <div className="mt-6">
          {useDialog && onOpenAllPhotos ? (
            <button
              type="button"
              className="text-gray-600 hover:text-gray-900 underline text-sm"
              onClick={onOpenAllPhotos}
            >
              {pp("seeAllImages")}
            </button>
          ) : (
            <Link href={galleryHref}>
              <span className="text-gray-600 hover:text-gray-900 underline text-sm">{pp("seeAllImages")}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default PartnerPhotos;