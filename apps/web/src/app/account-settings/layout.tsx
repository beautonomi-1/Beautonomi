import React from "react";
import { redirect } from "next/navigation";
import AccountSettingsNavbar from "@/components/layout/account-settings-navbar";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AccountShellClient } from "./_shell/AccountShellClient";

export default async function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/?login=true&redirect=${encodeURIComponent("/account-settings")}`);
  }

  return (
    <div className="min-h-screen bg-white w-full max-w-full">
      <AccountSettingsNavbar />
      <AccountShellClient>
        <main className="min-h-screen pb-20 md:pb-0 w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </AccountShellClient>
      <Footer />
      <BottomNav />
    </div>
  );
}
