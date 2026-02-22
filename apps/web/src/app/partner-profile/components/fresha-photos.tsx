"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import Image1 from "./../../../../public/images/pexels-steinportraits-1898555.jpg";
import Image2 from "./../../../../public/images/pexels-rdne-7035446.jpg";
import Image4 from "./../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import Image5 from "./../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import Image6 from "./../../../../public/images/pexels-rdne-6724431.jpg";

const images = [
  { src: Image1, alt: "Luxurious nail spa interior" },
  { src: Image2, alt: "Elegant interior with plush seating" },
  { src: Image6, alt: "Luxurious seating area" },
  { src: Image4, alt: "Chic interior with soft pink seating" },
  { src: Image5, alt: "Elegant pink French manicure" },
];

const PartnerPhotos: React.FC = () => {
  const [_selectedImage, _setSelectedImage] = useState<number | null>(null);

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Photos</h2>
      
      {/* Desktop Grid */}
      <div className="hidden md:grid grid-cols-2 gap-2">
        <div className="row-span-2">
          <Link href="/partner-profile/gallery">
            <Image
              src={images[0].src}
              alt={images[0].alt}
              className="h-[500px] w-full rounded-l-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
            />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {images.slice(1, 5).map((image, index) => (
            <Link key={index} href="/partner-profile/gallery">
              <Image
                src={image.src}
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
        {images.map((image, index) => (
          <Link key={index} href="/partner-profile/gallery">
            <Image
              src={image.src}
              alt={image.alt}
              className="h-[200px] w-full object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            />
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/partner-profile/gallery">
          <button className="text-gray-600 hover:text-gray-900 underline text-sm">
            See all images
          </button>
        </Link>
      </div>
    </div>
  );
};

export default PartnerPhotos;
