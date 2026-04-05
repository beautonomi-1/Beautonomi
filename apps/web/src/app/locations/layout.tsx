import { Suspense } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";

export default function LocationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <Suspense fallback={<div className="h-[73px] border-b border-gray-100 bg-white" aria-hidden />}>
        <BeautonomiHeader />
      </Suspense>
      <main>{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
