import React from "react";
import AccountSettingsNavbar from "@/components/layout/account-settings-navbar";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";

export default function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
      <AccountSettingsNavbar />
      <main className="min-h-screen pb-20 md:pb-0 w-full max-w-full overflow-x-hidden">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
