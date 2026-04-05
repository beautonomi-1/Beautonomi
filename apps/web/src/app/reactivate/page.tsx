"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck } from "lucide-react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";

/**
 * Page linked from deactivation confirmation (e.g. email) or when user lands with ?deactivated=true.
 * Explains that they can log in again to reactivate their account (self-service only).
 */
export default function ReactivatePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <BeautonomiHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-xl">Reactivate your account</CardTitle>
            <CardDescription>
              You deactivated your account. Log in again to reactivate and get back to your bookings, orders, and profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full bg-[#FF0077] hover:bg-[#D60565]">
              <Link href="/login?redirect=/">Log in to reactivate</Link>
            </Button>
            <p className="text-xs text-center text-gray-500">
              If your account was deactivated by support, please{" "}
              <Link
                href={PLATFORM_CONTACT_HREF}
                className="text-[#FF0077] underline underline-offset-2 hover:text-[#D60565]"
              >
                contact us
              </Link>{" "}
              to reactivate.
            </p>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
