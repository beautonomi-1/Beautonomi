"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  // On mobile, show only last 2 items if more than 2
  const displayItems = items.length > 2 
    ? [items[0], ...items.slice(-2)] 
    : items;
  
  const shouldShowEllipsis = items.length > 2;

  return (
    <nav className="mb-4 md:mb-6" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1 md:space-x-2 text-xs md:text-sm text-gray-500 overflow-x-auto scrollbar-hide">
        {displayItems.map((item, displayIndex) => {
          const originalIndex = shouldShowEllipsis && displayIndex > 0 
            ? items.length - (displayItems.length - displayIndex)
            : displayIndex;
          const isLast = originalIndex === items.length - 1;
          
          return (
            <li key={originalIndex} className="flex items-center flex-shrink-0">
              {shouldShowEllipsis && displayIndex === 1 && (
                <>
                  <span className="mx-1 md:mx-2 text-gray-400">...</span>
                  <ChevronRight className="w-3 h-3 md:w-4 md:h-4 mx-1 md:mx-2 text-gray-400" />
                </>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-[#FF0077] transition-colors px-1 py-0.5 rounded active:bg-gray-100"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "text-gray-900 font-medium px-1" : "px-1"}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="w-3 h-3 md:w-4 md:h-4 mx-1 md:mx-2 text-gray-400 flex-shrink-0" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
