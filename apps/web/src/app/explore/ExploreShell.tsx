"use client";

import type { ReactNode } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";

export default function ExploreShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <main className="w-full max-w-full overflow-x-hidden">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
