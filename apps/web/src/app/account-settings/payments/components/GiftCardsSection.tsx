"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Copy, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { supportTicketQuery } from "@beautonomi/utils";

interface GiftCardMetadata {
  recipient_email?: string;
  recipient_name?: string;
  sender_name?: string;
  message?: string;
  [key: string]: unknown;
}

interface GiftCard {
  id: string;
  code: string;
  currency: string | null;
  initial_balance: number;
  balance: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  deliver_at?: string | null;
  delivered_at?: string | null;
  can_resend?: boolean;
  metadata?: GiftCardMetadata | null;
}

type Status = "active" | "partial" | "used" | "expired" | "inactive";

const SESSION_GIFT_CARD_KEY = "beautonomi_booking_gift_card_code";

function unwrapGiftCardsResponse(res: unknown): GiftCard[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const inner = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : r;
  const list = inner.gift_cards;
  return Array.isArray(list) ? (list as GiftCard[]) : [];
}

function classifyCard(card: GiftCard): Status {
  if (!card.is_active) return "inactive";
  if (card.expires_at && new Date(card.expires_at).getTime() < Date.now()) return "expired";
  const balance = Number(card.balance ?? 0);
  const initial = Number(card.initial_balance ?? 0);
  if (balance <= 0) return "used";
  if (initial > 0 && balance < initial) return "partial";
  return "active";
}

function isUsable(status: Status): boolean {
  return status === "active" || status === "partial";
}

function maskCode(code: string): string {
  const cleaned = code.trim();
  if (cleaned.length <= 4) return cleaned;
  const visible = cleaned.slice(-4);
  const hiddenLen = cleaned.length - 4;
  return `${"•".repeat(Math.min(hiddenLen, 12))}${visible}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function GiftCardsSection() {
  const { bundle } = useConfigBundle();
  const router = useRouter();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const response = await fetcher.get<unknown>("/api/me/gift-cards", { cache: "no-store" });
        if (!cancelled) setGiftCards(unwrapGiftCardsResponse(response));
      } catch (error) {
        console.error("Failed to load gift cards:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatCurrency = (amount: number, currency: string | null | undefined) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || tenantCurrency || LAST_RESORT_CURRENCY).toUpperCase(),
    }).format(Number(amount || 0));

  const sortedCards = useMemo(() => {
    return [...giftCards].sort((a, b) => {
      const sa = classifyCard(a);
      const sb = classifyCard(b);
      const ua = isUsable(sa) ? 0 : 1;
      const ub = isUsable(sb) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [giftCards]);

  const usableCount = useMemo(
    () => sortedCards.filter((c) => isUsable(classifyCard(c))).length,
    [sortedCards]
  );

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (card: GiftCard) => {
    const ok = await copyToClipboard(card.code);
    if (ok) {
      setCopiedId(card.id);
      toast.success("Gift card code copied");
      setTimeout(() => setCopiedId((current) => (current === card.id ? null : current)), 2000);
    } else {
      toast.error("Couldn't copy automatically — long-press the code to copy it");
      setRevealedIds((prev) => new Set(prev).add(card.id));
    }
  };

  const handleResend = async (card: GiftCard) => {
    setResendingId(card.id);
    try {
      await fetcher.post(`/api/me/gift-cards/${card.id}/resend`, {});
      toast.success("Gift card resent to the recipient");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend gift card");
    } finally {
      setResendingId(null);
    }
  };

  const handleUseAtBooking = async (card: GiftCard) => {
    await copyToClipboard(card.code);
    try {
      window.sessionStorage.setItem(SESSION_GIFT_CARD_KEY, card.code);
    } catch {
      // sessionStorage may be unavailable (private mode); the saved card still auto-loads from /api/me/gift-cards in the booking flow.
    }
    toast.success("Code copied — pick a service and it'll apply at checkout", {
      duration: 5000,
    });
    router.push("/");
  };

  const renderStatusBadge = (status: Status) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs">Active</Badge>;
      case "partial":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs">Active · partly used</Badge>;
      case "used":
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-xs">Fully redeemed</Badge>;
      case "expired":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Expired</Badge>;
      case "inactive":
        return <Badge variant="outline" className="text-xs">Inactive</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6">
        <LoadingTimeout loadingMessage="Loading gift cards..." />
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
            Beautonomi gift credit
          </h2>
          {sortedCards.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {usableCount > 0
                ? `${usableCount} card${usableCount === 1 ? "" : "s"} ready to use at checkout`
                : "No usable balance right now"}
            </p>
          )}
        </div>
        <Link
          href="/gift-card"
          className="inline-block bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl text-center"
        >
          Buy gift card
        </Link>
      </div>

      {sortedCards.length === 0 ? (
        <div className="text-center py-8">
          <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-base font-light mb-4 text-gray-600">
            You don&apos;t have any gift cards yet.
          </p>
          <Link
            href="/gift-card/purchase"
            className="inline-block bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl text-center"
          >
            Purchase your first gift card
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCards.map((card) => {
            const status = classifyCard(card);
            const usable = isUsable(status);
            const balance = Number(card.balance ?? 0);
            const initial = Number(card.initial_balance ?? 0);
            const usedAmount = Math.max(0, initial - balance);
            const usedPct = initial > 0 ? Math.min(100, Math.round((usedAmount / initial) * 100)) : 0;
            const isRevealed = revealedIds.has(card.id);
            const isCopied = copiedId === card.id;
            const meta = (card.metadata ?? {}) as GiftCardMetadata;
            const expiresAt = card.expires_at ? new Date(card.expires_at) : null;

            return (
              <div
                key={card.id}
                className={`rounded-2xl border bg-gradient-to-br p-4 sm:p-5 transition-all ${
                  usable
                    ? "border-primary/20 from-primary/5 via-white to-white shadow-sm"
                    : "border-gray-200 from-gray-50 via-white to-white opacity-90"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <Gift className="w-4 h-4 text-primary" />
                    Gift credit
                  </div>
                  {renderStatusBadge(status)}
                </div>

                <div className="mb-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
                      {formatCurrency(balance, card.currency)}
                    </span>
                    {initial > 0 && initial !== balance && (
                      <span className="text-sm text-gray-500">
                        of {formatCurrency(initial, card.currency)}
                      </span>
                    )}
                  </div>
                  {initial > 0 && (
                    <div
                      className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.max(0, 100 - usedPct)}
                      aria-label={`${100 - usedPct}% remaining`}
                    >
                      <div
                        className={`h-full ${usable ? "bg-primary" : "bg-gray-400"} transition-all`}
                        style={{ width: `${Math.max(0, 100 - usedPct)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 mb-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Gift card code
                  </div>
                  <div
                    className="font-mono text-base sm:text-lg font-semibold text-gray-900 break-all select-all leading-relaxed"
                    aria-label={isRevealed ? `Gift card code ${card.code}` : "Gift card code hidden"}
                  >
                    {isRevealed ? card.code : maskCode(card.code)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleReveal(card.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                      aria-pressed={isRevealed}
                    >
                      {isRevealed ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Show code
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(card)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy code
                        </>
                      )}
                    </button>
                    {usable && (
                      <button
                        type="button"
                        onClick={() => handleUseAtBooking(card)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-hover text-sm font-semibold transition-colors"
                      >
                        Use at booking
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    {card.can_resend && usable ? (
                      <button
                        type="button"
                        onClick={() => void handleResend(card)}
                        disabled={resendingId === card.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                      >
                        {resendingId === card.id ? "Resending…" : "Resend"}
                      </button>
                    ) : null}
                    <Link
                      href={`/help/submit-ticket${supportTicketQuery({
                        giftCardId: card.id,
                        giftCardCode: card.code,
                        category: "payment_gift_card",
                      })}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                    >
                      Contact support
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {expiresAt && (
                    <span>
                      {status === "expired" ? "Expired" : "Expires"}{" "}
                      {expiresAt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  {card.deliver_at && !card.delivered_at ? (
                    <span>
                      Sends{" "}
                      {new Date(card.deliver_at).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                  {card.delivered_at ? <span>Delivered</span> : null}
                  {meta.sender_name && <span>From {meta.sender_name}</span>}
                  {meta.recipient_name && <span>For {meta.recipient_name}</span>}
                </div>
                {meta.message && (
                  <p className="mt-2 text-sm italic text-gray-700 border-l-2 border-primary/30 pl-3">
                    “{meta.message}”
                  </p>
                )}
              </div>
            );
          })}

          <p className="text-xs text-gray-500 mt-2">
            Saved gift cards appear automatically in the <span className="font-medium">Promotions &amp; rewards</span> step
            of any booking — just tap <span className="font-medium">Apply</span>. You can also paste the copied code there.
          </p>
        </div>
      )}
    </div>
  );
}

export default GiftCardsSection;
