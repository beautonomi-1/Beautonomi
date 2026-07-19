"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function GiftCardClaimPage() {
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

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Gift card</h1>
      {status === "loading" ? <p>Adding to your wallet…</p> : null}
      {status === "done" ? <p>{message}</p> : null}
      {status === "error" ? <p>{message}</p> : null}
    </main>
  );
}
