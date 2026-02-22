import React, { useState } from "react";
import { Clock, MapPin } from "lucide-react";
import Link from "next/link";

interface BarbershopProps {
  name: string;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  openingTime: string;
  address: string;
}

const ShopCard: React.FC<BarbershopProps> = ({
  name,
  rating,
  reviewCount,
  isFeatured,
  openingTime,
  address,
}) => {
  const [_isAppointmentDialogOpen, _setIsAppointmentDialogOpen] = useState(false);

  return (
    <div className="w-full lg:max-w-sm mx-auto bg-white rounded-lg shadow-md overflow-hidden border">
      <div className="px-4 py-8">
        <h2 className="text-2xl font-bold mb-2">{name}</h2>
        <div className="flex items-center mb-2">
          <div className="flex mr-2">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={`w-5 h-5 ${
                  i < rating ? "text-yellow-400" : "text-gray-300"
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="text-blue-600 font-normal">({reviewCount})</span>
        </div>
        {isFeatured && (
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full mr-2 mb-2">
            Featured
          </span>
        )}
        <Link href="/partner-profile/appointment">
        <button
          className="block w-full bg-gray-900 text-white py-2 sm:py-4 mt-2 px-6 rounded-md hover:bg-gray-800 transition-colors"
          
        >
          Book now
        </button>
        </Link>
      </div>
      <div className="border-t border-gray-200 px-4 py-6">
        <div className="flex items-center mb-2">
          <Clock className="w-5 h-5 mr-2 text-gray-500 font-light" />
          <p className="text-gray-600">
            Closed <span className="font-light">opens at {openingTime}</span>
          </p>
        </div>
        <div className="flex items-start">
          <MapPin className="w-5 h-5 mr-2 text-gray-500 mt-1 flex-shrink-0" />
          <p className="text-gray-600 font-light">{address}</p>
        </div>
      </div>
      <div className="border-t border-gray-200 px-4 py-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-normal">Gift Cards</h3>
            <p className="text-gray-500 text-sm font-light">
              Treat yourself or a friend to future visits.
            </p>
          </div>
          <Link href="/gift-card/purchase">
            <button className="bg-white text-gray-900 border border-gray-300 px-3 py-1 rounded-md hover:bg-gray-100 transition-colors">
              Buy
            </button>
          </Link>
        </div>
      </div>
     
    </div>
  );
};

export default ShopCard;
