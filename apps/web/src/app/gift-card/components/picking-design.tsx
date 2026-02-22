"use client";
import { useState } from "react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface PickingDesignsProps {
  content?: PageContent | null;
}

export default function PickingDesigns({ content }: PickingDesignsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Get designs from CMS only - no fallback images
  let designs: Array<{ id: number; src: string; alt: string }> = [];

  // If CMS has designs_list (JSON), use it
  if (content?.designs_list?.content_type === "json") {
    try {
      const parsedDesigns = JSON.parse(content.designs_list.content);
      if (Array.isArray(parsedDesigns) && parsedDesigns.length > 0) {
        designs = parsedDesigns.map((d: any, index: number) => ({
          id: index + 1,
          src: d.image_url || d.src || "",
          alt: d.alt || d.title || `Design ${index + 1}`,
        }));
      }
    } catch (e) {
      console.error("Failed to parse designs_list from CMS:", e);
    }
  }

  // If no designs from CMS, show placeholder message
  const hasDesigns = designs.length > 0;

  const slidesToShow = 1;
  const duplicatedDesigns = hasDesigns ? [
    ...designs.slice(-slidesToShow),
    ...designs,
    ...designs.slice(1, slidesToShow),
  ] : [];

  const handlePrev = () => {
    if (!hasDesigns) return;
    setCurrentIndex((prevIndex) =>
      prevIndex > 0 ? prevIndex - 1 : designs.length -1
    );
  };

  const handleNext = () => {
    if (!hasDesigns) return;
    setCurrentIndex((prevIndex) =>
      prevIndex < duplicatedDesigns.length - slidesToShow ? prevIndex + 1 : 0
    );
  };

  // Get title and empty state message from CMS or use defaults
  const sectionTitle = content?.picking_designs_title?.content || "Pick your design";
  const emptyStateTitle = content?.designs_empty_state_title?.content || "Gift Card Designs";
  const emptyStateMessage = content?.designs_empty_state_message?.content || "Gift card designs will be available here. Check back soon!";

  return (
    <div className="pb-20 md:pb-24 lg:pb-28">
      <div className="container">
        <h1 className="text-center lg:text-start mb-10 lg:mb-8 text-[22px] md:text-[32px] font-normal text-secondary">
          {sectionTitle}
        </h1>
        {hasDesigns ? (
          <div className="">
            <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6">
              {designs.map((design) => (
                <div key={design.id} className="rounded-xl overflow-hidden">
                  {design.src ? (
                    <img 
                      src={design.src} 
                      alt={design.alt} 
                      className="rounded-xl w-full h-auto object-cover"
                    />
                  ) : (
                    <div className="w-full h-[300px] rounded-xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center">
                      <div className="text-center text-white">
                        <div className="text-4xl mb-2">🎨</div>
                        <div className="text-lg font-semibold">{design.alt}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="block md:hidden overflow-hidden">
              <div
                className="flex gap-4 transition-transform duration-500 ease-in-out"
                style={{
                  transform: `translateX(-${currentIndex * (10 / slidesToShow)}%)`,
                  width: `${(100 * duplicatedDesigns.length) / slidesToShow}%`,
                }}
              >
                {duplicatedDesigns.map((design, index) => (
                  <div
                    key={index}
                    className="w-full h-auto mb-6 lg:mb-20"
                  >
                    {design.src ? (
                      <img
                        src={design.src}
                        alt={design.alt}
                        className="rounded-xl object-cover w-full h-[300px]"
                      />
                    ) : (
                      <div className="w-full h-[300px] rounded-xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center">
                        <div className="text-center text-white">
                          <div className="text-4xl mb-2">🎨</div>
                          <div className="text-lg font-semibold">{design.alt}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex md:hidden gap-4 justify-center w-full">
              <button
                onClick={handlePrev}
                className="ml-2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
              </button>
              <button
                onClick={handleNext}
                className="mr-2 bg-white border h-8 w-8 rounded-full flex items-center justify-center"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="w-full h-[400px] rounded-xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center mb-6">
                <div className="text-center text-white">
                  <div className="text-6xl mb-4">🎨</div>
                  <div className="text-2xl font-bold">{emptyStateTitle}</div>
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                {emptyStateMessage}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
