"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type SubmitState = "idle" | "loading" | "success" | "error";

export function PartnerTalkToUsForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/public/provider-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim() || undefined,
          contact_person_name: contactName.trim() || undefined,
          email: email.trim() || undefined,
          phone_e164: phone.trim() || undefined,
          suggested_location_text: city.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { data?: { duplicate?: boolean }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message || "Something went wrong");
      }
      setState("success");
      setMessage(
        json.data?.duplicate
          ? "We already have your details — our team will be in touch."
          : "Thanks! Our team will reach out with next steps to get you on Beautonomi.",
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  if (state === "success") {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-3 text-left">
      <p className="text-sm text-gray-600 text-center mb-2">
        Prefer a call back? Tell us about your business and we&apos;ll help you get started.
      </p>
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Business name"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
      />
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Your name"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
      />
      <input
        type="email"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Phone (E.164, e.g. +27821234567)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="City / area"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />
      {message && state === "error" ? (
        <p className="text-sm text-red-600">{message}</p>
      ) : null}
      <Button type="submit" disabled={state === "loading"} className="w-full">
        {state === "loading" ? "Sending…" : "Talk to us"}
      </Button>
    </form>
  );
}
