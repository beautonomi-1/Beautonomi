import React from "react";
import Image from "next/image";
import Link from "next/link";

type RecentlyAddProps = {
  thumbnails?: string[];
  subtitle?: string;
};

const FALLBACK = "/images/placeholder-provider.jpg";

const RecentlyAdd = ({ thumbnails = [], subtitle }: RecentlyAddProps) => {
  const tiles = [...thumbnails].slice(0, 4);
  while (tiles.length < 4) tiles.push(FALLBACK);

  const hasRecentViews = thumbnails.length > 0;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-3">Recently viewed</h3>
      <Link href="/account-settings/wishlists/recently-viewed" className="block">
        <div className="border rounded-3xl grid grid-cols-2 p-2 max-w-sm gap-3 hover:border-[#FF0077] transition-colors cursor-pointer">
          {tiles.map((src, idx) => {
            const corner =
              idx === 0
                ? "rounded-tl-3xl"
                : idx === 1
                ? "rounded-tr-3xl"
                : idx === 2
                ? "rounded-bl-3xl"
                : "rounded-br-3xl";
            return (
              <div key={idx} className={`relative h-32 md:h-44 overflow-hidden ${corner}`}>
                <Image 
                  src={src} 
                  alt={hasRecentViews ? `Recently viewed provider ${idx + 1}` : "No recent views"} 
                  fill 
                  sizes="(max-width: 768px) 50vw, 25vw" 
                  className="object-cover" 
                />
              </div>
            );
          })}
        </div>
      </Link>
      <p className="text-sm text-gray-600 mt-2">
        {subtitle || (hasRecentViews ? "Click to view all recently viewed providers" : "Start browsing to build your list")}
      </p>
    </div>
  );
};

export default RecentlyAdd;
