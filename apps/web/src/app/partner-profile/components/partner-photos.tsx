"use client";
import React, { useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";
import { ProviderGalleryImage } from "@beautonomi/ui/web";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";

interface PartnerPhotosProps {
  gallery?: string[];
  businessName?: string;
  slug?: string;
}

const PartnerPhotos: React.FC<PartnerPhotosProps> = ({ gallery = [], businessName, slug }) => {
  const { pp } = usePartnerProfileT();
  const [_selectedImage, _setSelectedImage] = useState<number | null>(null);

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

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">{pp("tabPhotos")}</h2>
      
      {displayImages.length > 0 ? (
        <>
          {/* Desktop Grid */}
          <div className="hidden md:grid grid-cols-2 gap-2">
            <div className="row-span-2">
              <Link
                href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}
                className="block cursor-pointer hover:opacity-90 transition-opacity overflow-hidden rounded-l-xl"
              >
                <ProviderGalleryImage
                  src={displayImages[0].src}
                  alt={displayImages[0].alt}
                  priority
                />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {displayImages.slice(1, 5).map((image, index) => (
                <Link
                  key={index}
                  href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}
                  className={`block cursor-pointer hover:opacity-90 transition-opacity overflow-hidden ${
                    index === 1 ? "rounded-tr-xl" : ""
                  } ${index === 3 ? "rounded-br-xl" : ""}`}
                >
                  <ProviderGalleryImage src={image.src} alt={image.alt} />
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile Grid */}
          <div className="md:hidden grid grid-cols-2 gap-2">
            {displayImages.map((image, index) => (
              <Link
                key={index}
                href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}
                className="block cursor-pointer hover:opacity-90 transition-opacity overflow-hidden rounded-lg"
              >
                <ProviderGalleryImage src={image.src} alt={image.alt} />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title={pp("noPhotosAvailable")}
          description={pp("noPhotosHint")}
        />
      )}

      {displayImages.length > 0 && (
        <div className="mt-6">
          <Link href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}>
            <button className="text-gray-600 hover:text-gray-900 underline text-sm">
              {pp("seeAllImages")}
            </button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default PartnerPhotos;
