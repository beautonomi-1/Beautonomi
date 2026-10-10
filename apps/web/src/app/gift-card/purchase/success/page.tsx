"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar4 from "@/components/global/Navbar4";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";
import { Copy, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

type GiftCardRow = {
  id: string;
  code: string;
  balance: number;
  currency: string;
  metadata?: Record<string, unknown> | null;
};

type GiftCardTemplate = {
  id: string;
  name: string;
  image_url: string;
};

function unwrapGiftCardsPayload(res: unknown): GiftCardRow[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const inner = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : r;
  const list = inner.gift_cards;
  return Array.isArray(list) ? (list as GiftCardRow[]) : [];
}

function unwrapTemplatesPayload(res: unknown): GiftCardTemplate[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const inner = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : r;
  const list = inner.templates;
  return Array.isArray(list) ? (list as GiftCardTemplate[]) : [];
}

function getGiftCardTemplateDisplay(
  card: GiftCardRow,
  templates: GiftCardTemplate[],
): { name?: string; imageUrl?: string } {
  const metadata = card.metadata && typeof card.metadata === "object" ? card.metadata : {};
  const templateId = typeof metadata.template_id === "string" ? metadata.template_id : undefined;
  const cmsTemplate = templateId ? templates.find((t) => t.id === templateId) : undefined;
  return {
    name:
      typeof metadata.template_name === "string"
        ? metadata.template_name
        : cmsTemplate?.name,
    imageUrl:
      typeof metadata.template_image_url === "string"
        ? metadata.template_image_url
        : cmsTemplate?.image_url,
  };
}

function extractVerifyPayload(res: unknown): { type?: string; giftCardOrderId?: string } {
  if (!res || typeof res !== "object") return {};
  const r = res as Record<string, unknown>;
  const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : r;
  return {
    type: typeof data.type === "string" ? data.type : undefined,
    giftCardOrderId:
      typeof data.giftCardOrderId === "string"
        ? data.giftCardOrderId
        : typeof (data as { gift_card_order_id?: string }).gift_card_order_id === "string"
          ? (data as { gift_card_order_id: string }).gift_card_order_id
          : undefined,
  };
}

function GiftCardPurchaseSuccessInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nativeAppContext = searchParams.get("context") === "app";
  const reference =
    searchParams.get("reference")?.trim() ||
    searchParams.get("trxref")?.trim() ||
    "";
  const sessionId = searchParams.get("session_id");
  const tx = (key: string, opts?: Record<string, unknown>) =>
    t(`web.giftCard.purchaseSuccess.${key}`, opts);
  const [phase, setPhase] = useState<"idle" | "verifying" | "loading_codes" | "done" | "error">(
    reference ? "verifying" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [cards, setCards] = useState<GiftCardRow[]>([]);
  const [templates, setTemplates] = useState<GiftCardTemplate[]>([]);

  // If verification ends in a hard error we keep the recovery message but
  // auto-route to Payments after a short delay so the user always lands on a
  // page where their codes (or refund) will appear.
  useEffect(() => {
    if (nativeAppContext && typeof document !== "undefined") {
      document.title = "Payment";
    }
  }, [nativeAppContext]);

  useEffect(() => {
    if (phase !== "error") return;
    const t = setTimeout(() => {
      router.replace("/account-settings/payments");
    }, 6000);
    return () => clearTimeout(t);
  }, [phase, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      try {
        const raw = await fetcher.get<unknown>("/api/public/gift-cards/marketplace", { staleTimeMs: 300000 });
        if (!cancelled) setTemplates(unwrapTemplatesPayload(raw));
      } catch {
        // Codes remain usable even if artwork cannot be loaded.
      }
    }
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const verifyAndLoad = useCallback(async () => {
    if (!reference) {
      setPhase("idle");
      return;
    }
    setPhase("verifying");
    setErrorMsg(null);
    try {
      const verifyResult = await verifyWithRetry<Record<string, unknown>>(reference, {
        maxAttempts: 5,
        delayMs: 1500,
        sessionId,
      });
      const vp = extractVerifyPayload({ data: verifyResult.data });
      const oid = vp.giftCardOrderId ?? null;
      if (verifyResult.status === "failed") {
        setErrorMsg(verifyResult.errorMessage || tx("verifyFailed"));
        setPhase("error");
        return;
      }
      if (vp.type !== "gift_card_order" && verifyResult.status !== "unknown") {
        setErrorMsg(tx("wrongReceipt"));
        setPhase("error");
        return;
      }
      setOrderId(oid);

      setPhase("loading_codes");
      for (let attempt = 0; attempt < 20; attempt++) {
        const raw = await fetcher.get<unknown>("/api/me/gift-cards", { staleTimeMs: 0 });
        const all = unwrapGiftCardsPayload(raw);
        const filtered = oid
          ? all.filter((c) => {
              const mid =
                c.metadata && typeof c.metadata === "object"
                  ? (c.metadata as { order_id?: string }).order_id
                  : undefined;
              return mid === oid;
            })
          : all;
        if (filtered.length > 0) {
          setCards(filtered);
          setPhase("done");
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      const rawFinal = await fetcher.get<unknown>("/api/me/gift-cards", { staleTimeMs: 0 });
      const allFinal = unwrapGiftCardsPayload(rawFinal);
      const filteredFinal = oid
        ? allFinal.filter((c) => {
            const mid =
              c.metadata && typeof c.metadata === "object"
                ? (c.metadata as { order_id?: string }).order_id
                : undefined;
            return mid === oid;
          })
        : allFinal;
      setCards(filteredFinal);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof FetchError ? e.message : "Something went wrong");
      setPhase("error");
    }
  }, [reference]);

  useEffect(() => {
    void verifyAndLoad();
  }, [verifyAndLoad]);

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success(tx("codeCopied"));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar4 />
      <div className="mx-auto max-w-lg px-4 py-12">
        {!reference ? (
          <>
            <h1 className="mb-2 text-2xl font-semibold text-gray-900">{tx("noRefTitle")}</h1>
            <p className="mb-6 text-gray-600">{tx("noRefBody")}</p>
            <Button asChild>
              <Link href="/account-settings/payments">{tx("paymentsLink")}</Link>
            </Button>
          </>
        ) : phase === "verifying" || phase === "loading_codes" ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="font-medium text-gray-700">
              {phase === "verifying" ? tx("confirmingPayment") : tx("issuingCodes")}
            </p>
            <p className="mt-2 text-sm text-gray-500">{tx("usuallySeconds")}</p>
          </div>
        ) : phase === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-800">{errorMsg}</p>
            <Button asChild className="mt-4">
              <Link href="/account-settings/payments">{tx("viewPayments")}</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-green-600" />
              <h1 className="text-2xl font-bold text-gray-900">{tx("successTitle")}</h1>
              <p className="mt-2 text-gray-600">{tx("successBody")}</p>
            </div>
            <div className="space-y-4">
              {cards.map((c) => {
                const template = getGiftCardTemplateDisplay(c, templates);
                return (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {template.imageUrl ? (
                      <div className="relative aspect-[3/2] bg-gray-100">
                        <Image
                          src={template.imageUrl}
                          alt={template.name || "Gift card design"}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : null}
                    <div className="p-4">
                      {template.name ? (
                        <p className="mb-3 text-sm font-medium text-gray-700">{template.name}</p>
                      ) : null}
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {tx("codeLabel")}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-lg font-bold text-gray-900">{c.code}</code>
                        <button
                          type="button"
                          onClick={() => copyCode(c.code)}
                          className="rounded-lg p-2 hover:bg-gray-100"
                          aria-label={tx("copyCode")}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        {tx("balance", {
                          currency: c.currency,
                          amount: Number(c.balance).toFixed(2),
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {orderId && cards.length === 0 && (
                <p className="text-center text-gray-600">{tx("codesPending")}</p>
              )}
            </div>
            <div className="mt-8 flex flex-col gap-3">
              <Button asChild className="w-full">
                <Link href="/account-settings/payments">{tx("openPayments")}</Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/gift-card">{tx("backToGiftCards")}</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GiftCardPurchaseSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <GiftCardPurchaseSuccessInner />
    </Suspense>
  );
}
