"use client";
import React, { useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";

import Image1 from "./../../../../public/images/pexels-steinportraits-1898555.jpg";
import Image2 from "./../../../../public/images/pexels-rdne-7035446.jpg";
import Image4 from "./../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import Image5 from "./../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import Image6 from "./../../../../public/images/pexels-rdne-6724431.jpg";

const fallbackImages = [
  { src: Image1, alt: "Luxurious nail spa interior" },
  { src: Image2, alt: "Elegant interior with plush seating" },
  { src: Image6, alt: "Luxurious seating area" },
  { src: Image4, alt: "Chic interior with soft pink seating" },
  { src: Image5, alt: "Elegant pink French manicure" },
];

interface PartnerPhotosProps {
  gallery?: string[];
  businessName?: string;
  slug?: string;
}

const PartnerPhotos: React.FC<PartnerPhotosProps> = ({ gallery = [], businessName, slug }) => {
  const [_selectedImage, _setSelectedImage] = useState<number | null>(null);

  // Resolve image src to string (StaticImageData.src for static imports)
  const imgSrc = (img: { src: string | import("next/image").StaticImageData }) =>
    typeof img.src === "string" ? img.src : img.src.src;

  // Use gallery from API if available, otherwise fallback to default images
  const displayImages = React.useMemo(() => {
    if (gallery && gallery.length > 0) {
      return gallery.map((url, idx) => ({
        src: url,
        alt: `${businessName || 'Provider'} image ${idx + 1}`
      }));
    }
    return fallbackImages;
  }, [gallery, businessName]);

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Photos</h2>
      
      {displayImages.length > 0 ? (
        <>
          {/* Desktop Grid */}
          <div className="hidden md:grid grid-cols-2 gap-2">
            <div className="row-span-2">
              <Link href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}>
                <img
                  src={imgSrc(displayImages[0])}
                  alt={displayImages[0].alt}
                  className="h-[500px] w-full rounded-l-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {displayImages.slice(1, 5).map((image, index) => (
                <Link key={index} href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}>
                  <img
                    src={imgSrc(image)}
                    alt={image.alt}
                    className={`h-[245px] w-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${
                      index === 1 ? "rounded-tr-xl" : ""
                    } ${index === 3 ? "rounded-br-xl" : ""}`}
                  />
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile Grid */}
          <div className="md:hidden grid grid-cols-2 gap-2">
            {displayImages.map((image, index) => (
              <Link key={index} href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}>
                <img
                  src={imgSrc(image)}
                  alt={image.alt}
                  className="h-[200px] w-full object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="No photos available"
          description="This provider hasn't added any photos yet"
        />
      )}

      {displayImages.length > 0 && (
        <div className="mt-6">
          <Link href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"}>
            <button className="text-gray-600 hover:text-gray-900 underline text-sm">
              See all images
            </button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default PartnerPhotos;
