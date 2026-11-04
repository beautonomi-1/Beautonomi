"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";
import LoadingTimeout from "@/components/ui/loading-timeout";

type InviteView = {
  invited_name: string | null;
  status: string;
  currency: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  share_status: string | null;
  booking: {
    booking_number: string | null;
    scheduled_at: string | null;
    status: string | null;
    provider_name: string | null;
  } | null;
  can_pay: boolean;
  can_cancel: boolean;
};

function formatMoney(amount: number, currency: string | null, locale?: string): string {
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function GroupInvitePage() {
  return (
    <Suspense fallback={<LoadingTimeout isLoading className="min-h-[40vh]" />}>
      <GroupInviteInner />
    </Suspense>
  );
}

function GroupInviteInner() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(params.token ?? "");
  const returnedFromPayment = searchParams.get("payment") === "share";
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    returnedFromPayment ? t("web.groupInvite.paymentProcessing") : null,
  );

  const invitePath = `/group-invite/${encodeURIComponent(token)}`;
  const apiBase = `/api/public/group-invites/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetcher.get<{ data: { invite: InviteView } }>(apiBase);
      setInvite(res.data?.invite ?? null);
    } catch {
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleError = (e: unknown, fallbackKey: string) => {
    if (e instanceof FetchError && e.status === 401) {
      router.push(`/login?next=${encodeURIComponent(invitePath)}`);
      return;
    }
    setNotice(e instanceof FetchError ? e.message : t(fallbackKey));
  };

  const accept = async () => {
    setBusy(true);
    try {
      const res = await fetcher.post<{ data: { invite: InviteView } }>(`${apiBase}/accept`, {});
      if (res.data?.invite) setInvite(res.data.invite);
    } catch (e) {
      handleError(e, "web.groupInvite.acceptFailed");
    } finally {
      setBusy(false);
    }
  };

  const payShare = async () => {
    setBusy(true);
    try {
      const res = await fetcher.post<{ data: { authorization_url?: string } }>(`${apiBase}/pay`, {});
      const url = res.data?.authorization_url;
      if (url) window.location.href = url;
      else setNotice(t("web.groupInvite.payFailed"));
    } catch (e) {
      handleError(e, "web.groupInvite.payFailed");
    } finally {
      setBusy(false);
    }
  };

  const cancelSpot = async () => {
    if (!window.confirm(t("web.groupInvite.cancelConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetcher.post<{ data: { invite: InviteView | null; guest_refunded?: number } }>(
        `${apiBase}/cancel`,
        {},
      );
      if (res.data?.invite) setInvite(res.data.invite);
      const refunded = Number(res.data?.guest_refunded ?? 0);
      setNotice(
        refunded > 0
          ? t("web.groupInvite.cancelledRefunded", {
              amount: formatMoney(refunded, invite?.currency ?? null, i18n.language),
            })
          : t("web.groupInvite.cancelled"),
      );
    } catch (e) {
      handleError(e, "web.groupInvite.cancelFailed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingTimeout isLoading className="min-h-[40vh]" />;

  if (!invite) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <p>{t("web.groupInvite.notFound")}</p>
      </div>
    );
  }

  const when = invite.booking?.scheduled_at
    ? new Date(invite.booking.scheduled_at).toLocaleString(i18n.language, {
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;
  const shareCancelled = invite.share_status === "cancelled" || invite.status === "cancelled";
  const sharePaid = invite.amount_due > 0 && invite.amount_remaining <= 0;

  return (
    <div className="max-w-md mx-auto py-16 px-4 space-y-4 text-center">
      <h1 className="text-2xl font-bold">{t("web.groupInvite.title")}</h1>
      <p className="text-gray-600">{t("web.groupInvite.body", { name: invite.invited_name ?? "" })}</p>
      {invite.booking ? (
        <div className="rounded-lg border border-gray-200 p-4 text-left text-sm space-y-1">
          {invite.booking.provider_name ? <p className="font-medium">{invite.booking.provider_name}</p> : null}
          {when ? <p>{when}</p> : null}
          {invite.amount_due > 0 ? (
            <p>
              {t("web.groupInvite.yourShare", {
                amount: formatMoney(invite.amount_due, invite.currency, i18n.language),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {notice ? <p className="text-sm text-gray-700">{notice}</p> : null}

      {shareCancelled ? (
        <p className="text-sm font-medium text-gray-700">{t("web.groupInvite.cancelled")}</p>
      ) : sharePaid ? (
        <p className="text-sm font-medium text-green-700">{t("web.groupInvite.sharePaid")}</p>
      ) : null}

      {invite.status === "pending" && !shareCancelled ? (
        <Button disabled={busy} onClick={() => void accept()}>
          {t("web.groupInvite.accept")}
        </Button>
      ) : null}
      {invite.can_pay ? (
        <Button disabled={busy} onClick={() => void payShare()}>
          {t("web.groupInvite.payShareAmount", {
            amount: formatMoney(invite.amount_remaining, invite.currency, i18n.language),
          })}
        </Button>
      ) : null}
      {invite.can_cancel ? (
        <div>
          <Button variant="outline" disabled={busy} onClick={() => void cancelSpot()}>
            {t("web.groupInvite.cancelSpot")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
