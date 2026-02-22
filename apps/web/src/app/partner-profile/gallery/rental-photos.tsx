"use client";
import React from "react";
import EmptyState from "@/components/ui/empty-state";

interface RentalPhotosProps {
  gallery?: string[];
  businessName?: string;
  slug?: string;
}

const RentalPhotos: React.FC<RentalPhotosProps> = ({ gallery = [], businessName = "Provider" }) => {
  // If no gallery images, show empty state
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

  // Group images into sections for better display
  // For now, we'll display all images in a simple grid
  // You can enhance this later to group by category if needed
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
        <h2 className="text-[22px] font-normal text-secondary mb-6">
          Photo tour
        </h2>
        
        {/* Section Navigation - only show if multiple sections */}
        {sections.length > 1 && (
          <div
            className="flex overflow-x-scroll md:overflow-auto md:flex-wrap gap-7 gap-y-0 border-b md:border-none pb-11 md:pb-0 mb-10 md:mb-12"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {sections.map((section, _idx) => (
              <div
                key={section.sectionId}
                onClick={() => scrollToSection(section.sectionId)}
                className="cursor-pointer"
              >
                <div className="relative w-[340px] md:w-[145px] h-[340px] md:h-[145px]">
                  <img
                    src={section.images[0]}
                    alt={`${businessName} - ${section.title}`}
                    className="w-full h-full object-cover rounded-md"
                  />
                </div>
                <p className="text-sm font-normal text-secondary mt-2 mb-3">
                  {section.title}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Image Sections */}
        {sections.map((section, _sectionIdx) => (
          <div
            key={section.sectionId}
            id={section.sectionId}
            className="block md:grid grid-cols-12 mb-9 md:mb-6"
          >
            {sections.length > 1 && (
              <div className="col-span-4 mb-6">
                <h3 className="text-[22px] font-normal text-secondary">
                  {section.title}
                </h3>
                <p className="text-sm font-normal text-destructive">
                  {section.images.length} {section.images.length === 1 ? 'photo' : 'photos'}
                </p>
              </div>
            )}
            <div className={sections.length > 1 ? "col-span-8 mb-6" : "col-span-12 mb-6"}>
              <div>
                {/* First image full width if multiple images */}
                {section.images.length > 1 && (
                  <img
                    src={section.images[0]}
                    alt={`${businessName} - ${section.title} - Image 1`}
                    className="w-full mb-3 rounded-lg"
                  />
                )}
                {/* Remaining images in grid */}
                {section.images.length > 1 && (
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {section.images.slice(1).map((imageUrl, i) => (
                      <img
                        key={i}
                        src={imageUrl}
                        alt={`${businessName} - ${section.title} - Image ${i + 2}`}
                        className="w-full rounded-lg"
                      />
                    ))}
                  </div>
                )}
                {/* Single image display */}
                {section.images.length === 1 && (
                  <img
                    src={section.images[0]}
                    alt={`${businessName} - ${section.title}`}
                    className="w-full rounded-lg"
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RentalPhotos;
