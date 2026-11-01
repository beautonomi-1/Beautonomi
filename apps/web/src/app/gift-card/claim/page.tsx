"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Navbar4 from "@/components/global/Navbar4";
import { Button } from "@/components/ui/button";
import { GiftCardBreadcrumb } from "../components/gift-card-breadcrumb";

function GiftCardClaimInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing gift link.");
      return;
    }
    setStatus("loading");
    fetch("/api/public/gift-cards/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push(`/login?next=${encodeURIComponent(`/gift-card/claim?token=${token}`)}`);
            return;
          }
          throw new Error((body as { error?: string }).error ?? "Could not claim gift card");
        }
        setStatus("done");
        setMessage("Your gift card has been added to your wallet.");
        setTimeout(() => router.push("/account-settings/wallet"), 1500);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, [token, router]);

  const pending = status === "idle" || status === "loading";

  return (
    <div className="min-h-screen bg-white">
      <Navbar4 />
      <main className="mx-auto max-w-lg px-4 pb-28 pt-6 md:pb-16 md:pt-8">
        <GiftCardBreadcrumb current="claim" />
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Gift card</h1>
          {pending ? (
            <div className="mt-4 flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Adding to your wallet" />
              <p className="mt-3 text-gray-600">Adding to your wallet…</p>
            </div>
          ) : null}
          {status === "done" ? <p className="mt-3 text-gray-700">{message}</p> : null}
          {status === "error" ? (
            <>
              <p className="mt-3 text-gray-700">{message}</p>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link href="/gift-card">Back to gift cards</Link>
              </Button>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function GiftCardClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      }
    >
      <GiftCardClaimInner />
    </Suspense>
  );
}
