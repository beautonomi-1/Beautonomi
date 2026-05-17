"use client";
import React from "react";
import EmptyState from "@/components/ui/empty-state";
import { ProviderGalleryImage } from "@beautonomi/ui/web";

interface RentalPhotosProps {
  gallery?: string[];
  businessName?: string;
  slug?: string;
}

const RentalPhotos: React.FC<RentalPhotosProps> = ({ gallery = [], businessName = "Provider" }) => {
  if (!gallery || gallery.length === 0) {
    return (
      <div className="container">
        <div className="py-8">
          <EmptyState
            title="No photos available"
            description="This provider hasn't added any photos to their gallery yet."
          />
        </div>
      </div>
    );
  }

  const imagesPerSection = 4;
  const sections = [];

  for (let i = 0; i < gallery.length; i += imagesPerSection) {
    const sectionImages = gallery.slice(i, i + imagesPerSection);
    sections.push({
      sectionId: `section-${Math.floor(i / imagesPerSection)}`,
      images: sectionImages,
      title: `Gallery ${Math.floor(i / imagesPerSection) + 1}`,
    });
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="container">
      <div>
        <h2 className="text-[22px] font-normal text-secondary mb-6">Photo tour</h2>

        {sections.length > 1 && (
          <div
            className="flex overflow-x-scroll md:overflow-auto md:flex-wrap gap-7 gap-y-0 border-b md:border-none pb-11 md:pb-0 mb-10 md:mb-12"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {sections.map((section) => (
              <div
                key={section.sectionId}
                onClick={() => scrollToSection(section.sectionId)}
                className="cursor-pointer shrink-0 w-[340px] md:w-[280px]"
              >
                <ProviderGalleryImage
                  src={section.images[0]}
                  alt={`${businessName} - ${section.title}`}
                  frameClassName="rounded-md"
                />
                <p className="text-sm font-normal text-secondary mt-2 mb-3">{section.title}</p>
              </div>
            ))}
          </div>
        )}

        {sections.map((section) => (
          <div
            key={section.sectionId}
            id={section.sectionId}
            className="block md:grid grid-cols-12 mb-9 md:mb-6"
          >
            {sections.length > 1 && (
              <div className="col-span-4 mb-6">
                <h3 className="text-[22px] font-normal text-secondary">{section.title}</h3>
                <p className="text-sm font-normal text-destructive">
                  {section.images.length} {section.images.length === 1 ? "photo" : "photos"}
                </p>
              </div>
            )}
            <div className={sections.length > 1 ? "col-span-8 mb-6" : "col-span-12 mb-6"}>
              <div className="flex flex-col gap-3">
                {section.images.map((imageUrl, i) => (
                  <ProviderGalleryImage
                    key={`${section.sectionId}-${i}`}
                    src={imageUrl}
                    alt={`${businessName} - ${section.title} - Image ${i + 1}`}
                    frameClassName="rounded-lg"
                    sizes="(min-width: 768px) 66vw, 100vw"
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RentalPhotos;
