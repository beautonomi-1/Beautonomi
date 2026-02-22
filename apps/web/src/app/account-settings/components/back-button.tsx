"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
  showOnMobile?: boolean;
}

export default function BackButton({ 
  href, 
  label = "Back", 
  className = "",
  showOnMobile = true
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={handleClick}
      className={`
        ${showOnMobile ? 'flex' : 'hidden md:flex'} 
        items-center gap-2 
        text-gray-600 hover:text-[#FF0077] 
        mb-3 md:mb-4 
        px-2 md:px-4
        py-2 md:py-2
        -ml-2 md:ml-0
        transition-colors
        active:bg-gray-100
        ${className}
      `}
    >
      <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
      <span className="text-sm md:text-base">{label}</span>
    </Button>
  );
}
