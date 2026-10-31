"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { CourierCredentialsPublicStatus } from "@/lib/orders/provider-shipping-credentials";

export type CourierCredentialsSaveHandle = {
  savePendingIfAny: () => Promise<boolean>;
};

type Props = {
  preference: "aramex" | "courier-guy" | "bob-go" | null;
  isOwner: boolean;
  onSaved?: () => void;
};

export const ProviderCourierCredentialsCard = forwardRef<CourierCredentialsSaveHandle, Props>(
  function ProviderCourierCredentialsCard({ preference, isOwner, onSaved }, ref) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CourierCredentialsPublicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [cgKey, setCgKey] = useState("");
  const [bgKey, setBgKey] = useState("");
  const [bgWebhookSecret, setBgWebhookSecret] = useState("");
  const [aramex, setAramex] = useState({
    accountNumber: "",
    accountPin: "",
    username: "",
    password: "",
    domesticProductType: "ONP",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data?: { status?: CourierCredentialsPublicStatus } }>(
        "/api/provider/courier-credentials",
      );
      setStatus(res?.data?.status ?? null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPendingCredentialInput = Boolean(
    preference &&
      ((preference === "courier-guy" && cgKey.trim()) ||
        (preference === "bob-go" && (bgKey.trim() || bgWebhookSecret.trim())) ||
        (preference === "aramex" &&
          (aramex.accountNumber.trim() ||
            aramex.accountPin.trim() ||
            aramex.username.trim() ||
            aramex.password.trim()))),
  );

  const saveCredentials = async (): Promise<boolean> => {
    if (!isOwner || !preference) return false;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (preference === "courier-guy" && cgKey.trim()) {
        body.courier_guy = { apiKey: cgKey.trim() };
      }
      if (preference === "bob-go" && (bgKey.trim() || bgWebhookSecret.trim())) {
        body.bob_go = {
          ...(bgKey.trim() ? { apiKey: bgKey.trim() } : {}),
          ...(bgWebhookSecret.trim() ? { webhookSecret: bgWebhookSecret.trim() } : {}),
        };
      }
      if (preference === "aramex") {
        const patch: Record<string, string> = {};
        if (aramex.accountNumber.trim()) patch.accountNumber = aramex.accountNumber.trim();
        if (aramex.accountPin.trim()) patch.accountPin = aramex.accountPin.trim();
        if (aramex.username.trim()) patch.username = aramex.username.trim();
        if (aramex.password.trim()) patch.password = aramex.password.trim();
        if (aramex.domesticProductType.trim()) {
          patch.domesticProductType = aramex.domesticProductType.trim();
        }
        if (Object.keys(patch).length) body.aramex = patch;
      }
      if (Object.keys(body).length === 0) {
        return false;
      }
      const res = await fetcher.put<{
        data?: { bob_go_webhook_subscribe?: { ok?: boolean; error?: string } | null };
      }>("/api/provider/courier-credentials", body);
      setCgKey("");
      setBgKey("");
      setBgWebhookSecret("");
      setAramex((a) => ({ ...a, accountPin: "", password: "" }));
      await load();
      onSaved?.();
      toast.success(t("web.provider.pages.ecommerce/shipping.courierSaved"));
      const sub = res?.data?.bob_go_webhook_subscribe;
      if (sub && sub.ok === false) {
        toast.message(t("web.provider.pages.ecommerce/shipping.bobGoWebhookSubscribeFailed"), {
          description:
            sub.error ??
            t("web.provider.pages.ecommerce/shipping.bobGoWebhookCatchUpHint"),
        });
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("web.provider.pages.ecommerce/shipping.courierSaveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    savePendingIfAny: async () => {
      if (!hasPendingCredentialInput) return true;
      return saveCredentials();
    },
  }));

  const testConnection = async () => {
    if (!isOwner || !preference) return;
    setTesting(true);
    try {
      const res = await fetcher.post<{
        data?: { verified?: boolean; result?: { ok?: boolean; error?: string; skipped?: string } };
      }>("/api/provider/courier-credentials/test", { courier: preference });
      if (res?.data?.verified) {
        toast.success(t("web.provider.pages.ecommerce/shipping.courierTestOk"));
        await load();
        onSaved?.();
      } else {
        const msg =
          res?.data?.result?.error ??
          res?.data?.result?.skipped ??
          t("web.provider.pages.ecommerce/shipping.courierTestFailed");
        toast.error(msg);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("web.provider.pages.ecommerce/shipping.courierTestFailed"));
    } finally {
      setTesting(false);
    }
  };

  if (!preference) return null;

  const connected =
    preference === "courier-guy"
      ? status?.["courier-guy"]?.connected
      : preference === "bob-go"
        ? status?.["bob-go"]?.connected
        : status?.aramex?.connected;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-base">{t("web.provider.pages.ecommerce/shipping.courierAccount")}</Label>
        {connected ? (
          <span className="text-xs font-medium text-emerald-700">{t("web.provider.pages.ecommerce/shipping.connected")}</span>
        ) : (
          <span className="text-xs font-medium text-amber-700">{t("web.provider.pages.ecommerce/shipping.notConnected")}</span>
        )}
      </div>
      {!isOwner ? (
        <p className="text-xs text-gray-500">{t("web.provider.pages.ecommerce/shipping.courierOwnerOnly")}</p>
      ) : loading ? (
        <p className="text-xs text-gray-500">{t("web.provider.pages.ecommerce/shipping.loading")}</p>
      ) : (
        <>
          {preference === "courier-guy" && (
            <div>
              <Label className="text-xs">{t("web.provider.pages.ecommerce/shipping.apiKey")}</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={status?.["courier-guy"]?.apiKeyHint ?? t("web.provider.pages.ecommerce/shipping.pasteApiKey")}
                value={cgKey}
                onChange={(e) => setCgKey(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
          {preference === "bob-go" && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">{t("web.provider.pages.ecommerce/shipping.apiKey")}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={status?.["bob-go"]?.apiKeyHint ?? t("web.provider.pages.ecommerce/shipping.pasteApiKey")}
                  value={bgKey}
                  onChange={(e) => setBgKey(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t("web.provider.pages.ecommerce/shipping.bobGoWebhookSecret")}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    status?.["bob-go"]?.webhookSecretConfigured
                      ? t("web.provider.pages.ecommerce/shipping.bobGoWebhookSecretConfigured")
                      : t("web.provider.pages.ecommerce/shipping.bobGoWebhookSecretOptional")
                  }
                  value={bgWebhookSecret}
                  onChange={(e) => setBgWebhookSecret(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  {t("web.provider.pages.ecommerce/shipping.bobGoWebhookSecretHint")}
                </p>
              </div>
            </div>
          )}
          {preference === "aramex" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder={t("web.provider.pages.ecommerce/shipping.aramexAccount")}
                value={aramex.accountNumber}
                onChange={(e) => setAramex((a) => ({ ...a, accountNumber: e.target.value }))}
              />
              <Input
                type="password"
                placeholder={t("web.provider.pages.ecommerce/shipping.aramexPin")}
                value={aramex.accountPin}
                onChange={(e) => setAramex((a) => ({ ...a, accountPin: e.target.value }))}
              />
              <Input
                placeholder={t("web.provider.pages.ecommerce/shipping.aramexUser")}
                value={aramex.username}
                onChange={(e) => setAramex((a) => ({ ...a, username: e.target.value }))}
              />
              <Input
                type="password"
                placeholder={t("web.provider.pages.ecommerce/shipping.aramexPassword")}
                value={aramex.password}
                onChange={(e) => setAramex((a) => ({ ...a, password: e.target.value }))}
              />
              <Input
                placeholder={t("web.provider.pages.ecommerce/shipping.aramexProductType")}
                value={aramex.domesticProductType}
                onChange={(e) => setAramex((a) => ({ ...a, domesticProductType: e.target.value }))}
                className="sm:col-span-2"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void saveCredentials()}>
              {saving ? t("web.provider.common.saving") : t("web.provider.pages.ecommerce/shipping.saveCourierKeys")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={testing || !connected} onClick={() => void testConnection()}>
              {testing ? t("web.provider.pages.ecommerce/shipping.testingCourier") : t("web.provider.pages.ecommerce/shipping.testCourierConnection")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
});
