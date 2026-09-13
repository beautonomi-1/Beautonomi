"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  paycloudApi,
  type PaycloudReadinessBlocker,
  type PaycloudReconciliationPayment,
  type PaycloudSettings,
  type PaycloudTerminal,
} from "@/lib/provider-portal/paycloud-api";
import { providerApi } from "@/lib/provider-portal/api";
import type { YocoDevice, Salon } from "@/lib/provider-portal/types";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUpgradeMessage } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  CreditCard,
  Plus,
  Smartphone,
  ShoppingBag,
  CheckCircle2,
  Circle,
  AlertTriangle,
  RefreshCw,
  Pencil,
  ArrowUpRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { paycloudAccountEnvironmentLabel } from "@/lib/payments/paycloud-account-label";
import { parseHighlightedOrderId } from "@/lib/terminal/terminal-shop-cta";
import { fetcher } from "@/lib/http/fetcher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const SETUP_STEPS: Array<{
  code: PaycloudReadinessBlocker["code"];
  labelKey: string;
}> = [
  { code: "FLAG_OFF", labelKey: "cardMachinesEnabledForYourMarket" },
  { code: "PLAN_REQUIRED", labelKey: "planIncludesCardMachines" },
  { code: "NOT_ACCEPTED", labelKey: "acceptInPersonCardPayments" },
  { code: "NO_TERMINALS", labelKey: "addACardMachine" },
  { code: "ALL_SUSPENDED", labelKey: "atLeastOneActiveMachine" },
  { code: "NO_MERCHANT", labelKey: "merchantSetupComplete" },
];

const KNOWN_SETUP_CODES = new Set(SETUP_STEPS.map((s) => s.code));

type PendingTerminalOrder = {
  id: string;
  order_status: string;
  invoice_status: string;
  integration_setup_status?: string | null;
  fulfillment_type?: string | null;
  terminal_products?: { name?: string; vendor?: string };
};

type MerchantApplicationSummary = {
  id: string;
  application_no: string;
  status: string;
};

export default function CardMachinesPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const activationOrderId = parseHighlightedOrderId(searchParams);
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const qrFlagEnabled = useFeatureFlag("payment_paycloud_qr");
  const cashbackFlagEnabled = useFeatureFlag("payment_paycloud_cashback");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalEcommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

  const [paycloudTerminals, setPaycloudTerminals] = useState<PaycloudTerminal[]>([]);
  const [yocoDevices, setYocoDevices] = useState<YocoDevice[]>([]);
  const [paycloudSettings, setPaycloudSettings] = useState<PaycloudSettings | null>(null);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<PaycloudTerminal | null>(null);
  const [form, setForm] = useState({ terminal_sn: "", display_name: "", location_id: "" });
  const [editForm, setEditForm] = useState({ display_name: "", location_id: "" });
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcilePayments, setReconcilePayments] = useState<PaycloudReconciliationPayment[]>([]);
  const [reconcileExceptions, setReconcileExceptions] = useState(0);
  const [pendingOrder, setPendingOrder] = useState<PendingTerminalOrder | null>(null);
  const [merchantApplication, setMerchantApplication] = useState<MerchantApplicationSummary | null>(null);
  const [activationSerial, setActivationSerial] = useState("");
  const [activationName, setActivationName] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    void loadData();
  }, [paycloudEnabled, yocoEnabled]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetcher.get<{ data: { application?: MerchantApplicationSummary | null } }>(
          "/api/provider/terminal-merchant-application?create=false",
        );
        const app = res.data?.application;
        if (app && !["approved", "declined", "cancelled"].includes(app.status)) {
          setMerchantApplication(app);
        } else {
          setMerchantApplication(null);
        }
      } catch {
        setMerchantApplication(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!terminalEcommerceEnabled) {
      setPendingOrder(null);
      return;
    }

    const isPendingActivation = (order: PendingTerminalOrder | undefined | null) => {
      if (!order) return false;
      if (order.invoice_status !== "paid") return false;
      if (order.integration_setup_status === "awaiting_merchant_onboarding") return false;
      if (order.integration_setup_status !== "pending") return false;
      const vendor = (order.terminal_products?.vendor ?? "").toLowerCase();
      return !vendor || vendor === "paycloud" || Boolean(activationOrderId);
    };

    void (async () => {
      try {
        if (activationOrderId) {
          const res = await fetcher.get<{ data: { order: PendingTerminalOrder } }>(
            `/api/provider/terminal-orders/${encodeURIComponent(activationOrderId)}`,
          );
          const order = res.data?.order;
          if (isPendingActivation(order)) {
            setPendingOrder(order!);
            setActivationName(order!.terminal_products?.name ?? t("web.provider.settings.pages.sales/card-machines.cardMachineFallback"));
            return;
          }
        }

        const listRes = await fetcher.get<{ data: { orders: PendingTerminalOrder[] } }>(
          "/api/provider/terminal-orders",
        );
        const pending = (listRes.data?.orders ?? []).find((o) => isPendingActivation(o));
        if (pending) {
          setPendingOrder(pending);
          setActivationName(pending.terminal_products?.name ?? t("web.provider.settings.pages.sales/card-machines.cardMachineFallback"));
        } else {
          setPendingOrder(null);
        }
      } catch {
        setPendingOrder(null);
      }
    })();
  }, [activationOrderId, terminalEcommerceEnabled]);

  const loadData = async () => {
    setLoading(true);
    try {
      const tasks: Promise<void>[] = [];
      if (paycloudEnabled) {
        tasks.push(
          paycloudApi.getSettings().then((s) => {
            setPaycloudSettings(s);
          }),
        );
        tasks.push(
          paycloudApi.listTerminals().then((r) => {
            setPaycloudTerminals(r.terminals);
          }),
        );
        tasks.push(
          paycloudApi.getReconciliation().then((r) => {
            setReconcilePayments(r.payments);
            setReconcileExceptions(r.summary.exceptions);
          }),
        );
      }
      if (yocoEnabled) {
        tasks.push(providerApi.listYocoDevices().then(setYocoDevices));
      }
      tasks.push(providerApi.getSalons().then(setSalons));
      await Promise.all(tasks);
    } catch (e) {
      console.error(e);
      toast.error(t("web.provider.settings.pages.sales/card-machines.failedToLoadCardMachines"));
    } finally {
      setLoading(false);
    }
  };

  const blockers = paycloudSettings?.blockers ?? [];
  const blockerCodes = new Set(blockers.map((b) => b.code));
  const setupProgress = useMemo(() => {
    const done = SETUP_STEPS.filter((s) => !blockerCodes.has(s.code)).length;
    return { done, total: SETUP_STEPS.length };
  }, [blockerCodes]);

  const unknownBlockers = blockers.filter((b) => !KNOWN_SETUP_CODES.has(b.code));

  const planBlocker = blockers.find((b) => b.code === "PLAN_REQUIRED");
  const needsAttention = useMemo(() => {
    const items: Array<{ id: string; label: string; detail?: string }> = [];
    const inFlight = paycloudSettings?.terminals?.inFlight ?? 0;
    if (inFlight > 0) {
      items.push({
        id: "in-flight",
        label: `${inFlight} payment${inFlight === 1 ? "" : "s"} waiting on card machine`,
        detail: t("web.provider.settings.pages.sales/card-machines.checkStatusToSync"),
      });
    }
    if (reconcileExceptions > 0) {
      items.push({
        id: "exceptions",
        label: `${reconcileExceptions} amount mismatch${reconcileExceptions === 1 ? "" : "es"}`,
        detail: t("web.provider.settings.pages.sales/card-machines.reviewRecentPayments"),
      });
    }
    for (const t of paycloudTerminals) {
      if (t.last_error) {
        items.push({
          id: `error-${t.id}`,
          label: `${t.display_name}: ${t.last_error}`,
        });
      }
    }
    return items;
  }, [paycloudSettings?.terminals?.inFlight, reconcileExceptions, paycloudTerminals]);

  const handleAddTerminal = async () => {
    if (!form.terminal_sn.trim() || !form.display_name.trim()) {
      toast.error(t("web.provider.settings.pages.sales/card-machines.serialNumberAndNameAreRequired"));
      return;
    }
    try {
      await paycloudApi.createTerminal({
        terminal_sn: form.terminal_sn.trim(),
        display_name: form.display_name.trim(),
        location_id: form.location_id || null,
      });
      toast.success(t("web.provider.settings.pages.sales/card-machines.cardMachineAdded"));
      setDialogOpen(false);
      setForm({ terminal_sn: "", display_name: "", location_id: "" });
      await loadData();
    } catch (e: unknown) {
      toastPlanGateError(e, t("web.provider.settings.pages.sales/card-machines.failedToAddCardMachine"));
    }
  };

  const openEdit = (terminal: PaycloudTerminal) => {
    setEditingTerminal(terminal);
    setEditForm({
      display_name: terminal.display_name,
      location_id: terminal.location_id ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditTerminal = async () => {
    if (!editingTerminal || !editForm.display_name.trim()) {
      toast.error(t("web.provider.settings.pages.sales/card-machines.displayNameIsRequired"));
      return;
    }
    try {
      await paycloudApi.updateTerminal(editingTerminal.id, {
        display_name: editForm.display_name.trim(),
        location_id: editForm.location_id || null,
      });
      toast.success(t("web.provider.settings.pages.sales/card-machines.cardMachineUpdated"));
      setEditDialogOpen(false);
      setEditingTerminal(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/card-machines.failedToUpdateCardMachineFallback"));
    }
  };

  const handleToggleActive = async (terminal: PaycloudTerminal, checked: boolean) => {
    try {
      await paycloudApi.updateTerminal(terminal.id, { is_active: checked });
      setPaycloudTerminals((prev) =>
        prev.map((t) => (t.id === terminal.id ? { ...t, is_active: checked } : t)),
      );
      toast.success(checked ? t("web.provider.settings.pages.sales/card-machines.cardMachineNowActive") : t("web.provider.settings.pages.sales/card-machines.cardMachineHiddenFromCheckout"));
      await loadData();
    } catch {
      toast.error(t("web.provider.settings.pages.sales/card-machines.failedToUpdateCardMachine"));
    }
  };

  const handleDeleteTerminal = async (terminal: PaycloudTerminal) => {
    try {
      await paycloudApi.deleteTerminal(terminal.id);
      toast.success(t("web.provider.settings.pages.sales/card-machines.cardMachineRemoved"));
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/card-machines.failedToRemoveCardMachine"));
    }
  };

  const handleActivateOrder = async () => {
    if (!activationSerial.trim()) {
      toast.error(t("web.provider.settings.pages.sales/card-machines.enterTheSerialNumberFromYour"));
      return;
    }
    setActivating(true);
    try {
      await paycloudApi.createTerminal({
        terminal_sn: activationSerial.trim(),
        display_name: activationName.trim() || `Card machine ${activationSerial.trim().slice(-4)}`,
      });
      toast.success(t("web.provider.settings.pages.sales/card-machines.cardMachineActivated"));
      setActivationSerial("");
      setPendingOrder(null);
      await loadData();
      if (!paycloudSettings?.accept_paycloud) {
        toast.message(t("web.provider.settings.pages.sales/card-machines.turnOnAcceptInPerson"));
      }
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/card-machines.failedToActivateCardMachine"));
    } finally {
      setActivating(false);
    }
  };

  const handleAcceptToggle = async (checked: boolean) => {
    try {
      await paycloudApi.updateSettings({ accept_paycloud: checked });
      setPaycloudSettings((prev) =>
        prev ? { ...prev, accept_paycloud: checked } : prev,
      );
      toast.success(checked ? t("web.provider.settings.pages.sales/card-machines.inPersonCardPaymentsEnabled") : t("web.provider.settings.pages.sales/card-machines.inPersonCardPaymentsDisabled"));
      await loadData();
    } catch {
      toast.error(t("web.provider.settings.pages.sales/card-machines.failedToUpdateSettings"));
    }
  };

  const handleQrToggle = async (checked: boolean) => {
    try {
      await paycloudApi.updateSettings({ qr_payments_enabled: checked });
      setPaycloudSettings((prev) =>
        prev ? { ...prev, qr_payments_enabled: checked } : prev,
      );
      toast.success(checked ? t("web.provider.settings.pages.sales/card-machines.walletQrPaymentsEnabled") : t("web.provider.settings.pages.sales/card-machines.walletQrPaymentsDisabled"));
    } catch {
      toast.error(t("web.provider.settings.pages.sales/card-machines.failedToUpdateSettings"));
    }
  };

  const handleCashbackToggle = async (checked: boolean) => {
    try {
      await paycloudApi.updateSettings({ cashback_enabled: checked });
      setPaycloudSettings((prev) =>
        prev ? { ...prev, cashback_enabled: checked } : prev,
      );
      toast.success(checked ? t("web.provider.settings.pages.sales/card-machines.cashbackEnabled") : t("web.provider.settings.pages.sales/card-machines.cashbackDisabled"));
    } catch {
      toast.error(t("web.provider.settings.pages.sales/card-machines.failedToUpdateSettings"));
    }
  };

  const handleReconcile = async () => {
    setReconcileLoading(true);
    try {
      const summary = await paycloudApi.reconcilePayments();
      const parts = [
        summary.settled > 0 ? `${summary.settled} settled` : null,
        summary.processing > 0 ? `${summary.processing} still processing` : null,
        summary.closed > 0 ? `${summary.closed} closed` : null,
      ].filter(Boolean);
      toast.success(
        parts.length > 0
          ? `Checked ${summary.checked} payment${summary.checked === 1 ? "" : "s"} — ${parts.join(", ")}`
          : `Checked ${summary.checked} payment${summary.checked === 1 ? "" : "s"} — no changes`,
      );
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/card-machines.failedToCheckPaymentStatus"));
    } finally {
      setReconcileLoading(false);
    }
  };

  if (loading) {
    return <LoadingTimeout loadingMessage={t("web.provider.settings.pages.sales/card-machines.loadingCardMachines")} />;
  }

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.sales/card-machines.cardMachines") },
  ];

  const acceptPaycloud = paycloudSettings?.accept_paycloud ?? false;
  const activePaycloud = paycloudTerminals.filter((t) => t.is_active).length;
  const activeYoco = yocoDevices.filter((d) => d.is_active).length;
  const statusLabel = paycloudSettings?.ready
    ? t("web.provider.settings.pages.sales/card-machines.ready")
    : !acceptPaycloud
      ? t("web.provider.settings.pages.sales/card-machines.notAccepting")
      : blockers[0]?.title ?? t("web.provider.settings.pages.sales/card-machines.setupIncomplete");
  const recentPayments = reconcilePayments.slice(0, 10);
  const exceptionPayments = reconcilePayments.filter(
    (p) =>
      p.amount_match_status &&
      p.amount_match_status !== "exact" &&
      p.amount_match_status !== "pending",
  );

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.sales.items.cardMachines.title")}
      subtitle={t("web.provider.settings.categories.sales.items.cardMachines.description")}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="mb-6 overflow-hidden border-pink-100 bg-gradient-to-br from-pink-50/70 via-white to-purple-50/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  paycloudSettings?.ready ? "bg-green-500" : acceptPaycloud ? "bg-amber-400" : "bg-gray-300"
                }`}
                aria-hidden
              />
              <span className="text-2xl font-semibold text-gray-900">{statusLabel}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {paycloudSettings?.ready
                ? t("web.provider.settings.pages.sales/card-machines.readyForCheckout")
                : acceptPaycloud
                  ? t("web.provider.settings.pages.sales/card-machines.finishSetupBelow")
                  : t("web.provider.settings.pages.sales/card-machines.turnOnAcceptanceToShow")}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t("web.provider.settings.pages.sales/card-machines.activeMachineCount", { count: activePaycloud })}
              {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)
                ? ` · ${paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)}`
                : ""}
            </p>
          </div>
          {paycloudEnabled ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-end">
<div className="text-xs text-gray-500">{t("web.provider.settings.pages.sales/card-machines.setup")}</div>
                <div className="text-lg font-semibold text-gray-900">
                  {setupProgress.done}/{setupProgress.total}
                </div>
              </div>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-pink-500 transition-all"
                  style={{ width: `${(setupProgress.done / Math.max(setupProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
        {(yocoEnabled || paystackTerminalEnabled) ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-pink-100/70 pt-3">
            {yocoEnabled ? (
              <Link
                href="/provider/settings/sales/yoco-devices"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200/70 hover:text-pink-700"
              >
{t("web.provider.settings.pages.sales/card-machines.yocoDevicesActive", { count: activeYoco })}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {paystackTerminalEnabled ? (
              <Link
                href="/provider/settings/sales/paystack-terminal"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200/70 hover:text-pink-700"
              >
{t("web.provider.settings.pages.sales/card-machines.paystackTerminalQrLink")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {paycloudEnabled ? (
        <>
          {planBlocker ? (
            <SectionCard className="mb-6 border-amber-200 bg-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-amber-950">{planBlocker.title}</div>
                  <div className="text-sm text-amber-800">
                    {getUpgradeMessage("integrations.paycloud")}
                  </div>
                </div>
                <Button asChild>
                  <Link href={planBlocker.href ?? "/provider/subscription"}>
                    <ArrowUpRight className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.viewPlans")}
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {merchantApplication &&
          ["draft", "submitted", "info_required", "in_review", "sent_to_acquirer", "awaiting_term_sheet"].includes(
            merchantApplication.status,
          ) ? (
            <SectionCard className="mb-6 border-indigo-200 bg-indigo-50/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-indigo-950">
{t("web.provider.settings.pages.sales/card-machines.finishCardMachineApplication", { number: merchantApplication.application_no })}
                  </div>
                  <div className="text-sm text-indigo-800">
                    {merchantApplication.status === "draft" || merchantApplication.status === "info_required"
                      ? t("web.provider.settings.pages.sales/card-machines.completeDetailsToShip")
                      : t("web.provider.settings.pages.sales/card-machines.trackApplicationStatus")}
                  </div>
                </div>
                <Button asChild>
                  <Link href="/provider/settings/sales/terminal-merchant-application">
{t("web.provider.settings.pages.sales/card-machines.openApplication")}
                    <ArrowUpRight className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {pendingOrder ? (
            <SectionCard className="mb-6 border-pink-200 bg-pink-50/40">
              <PageHeader
                title={t("web.provider.settings.pages.sales/card-machines.activateYourNewCardMachine")}
                subtitle={
                  pendingOrder.terminal_products?.name
? t("web.provider.settings.pages.sales/card-machines.orderNamed", { name: pendingOrder.terminal_products.name })
                    : t("web.provider.settings.pages.sales/card-machines.enterSerialToFinish")
                }
              />
              <p className="mt-2 text-sm text-gray-600">
{t("web.provider.settings.pages.sales/card-machines.findSerialOnDevice")}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.serialNumber")}</Label>
                  <Input
                    className="mt-1"
                    value={activationSerial}
                    onChange={(e) => setActivationSerial(e.target.value)}
                    placeholder={t("web.provider.settings.pages.sales/card-machines.fromDeviceLabel")}
                  />
                </div>
                <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.displayName")}</Label>
                  <Input
                    className="mt-1"
                    value={activationName}
                    onChange={(e) => setActivationName(e.target.value)}
                    placeholder={t("web.provider.settings.pages.sales/card-machines.frontDeskPortableEtc")}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void handleActivateOrder()} disabled={activating}>
                  {activating ? t("web.provider.settings.pages.sales/card-machines.activating") : t("web.provider.settings.pages.sales/card-machines.activateMachine")}
                </Button>
                {!acceptPaycloud ? (
                  <Button variant="outline" onClick={() => void handleAcceptToggle(true)}>
{t("web.provider.settings.pages.sales/card-machines.enableAcceptance")}
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard className="mb-6">
            <PageHeader
              title={t("web.provider.settings.pages.sales/card-machines.setupChecklist")}
              subtitle={t("web.provider.settings.pages.sales/card-machines.setupProgressDone", { done: setupProgress.done, total: setupProgress.total })}
            />
            <div className="mt-4 space-y-2">
              {SETUP_STEPS.map((step) => {
                const done = !blockerCodes.has(step.code);
                const blocker = blockers.find((b) => b.code === step.code);
                return (
                  <div
                    key={step.code}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300" />
                      )}
                      <span className={done ? "text-sm text-gray-700" : "text-sm font-medium text-gray-900"}>
                        {blocker?.title && !done ? blocker.title : t(`web.provider.settings.pages.sales/card-machines.${step.labelKey}`)}
                      </span>
                    </div>
                    {!done && blocker?.href ? (
                      <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                        <Link href={blocker.href}>{blocker.actionLabel}</Link>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {unknownBlockers.map((blocker) => (
                <div
                  key={blocker.code}
                  className="flex items-center justify-between rounded-lg border border-amber-200 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Circle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-gray-900">{blocker.title}</span>
                  </div>
                  {blocker.href ? (
                    <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                      <Link href={blocker.href}>{blocker.actionLabel}</Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {(paycloudSettings?.warnings ?? []).length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                {(paycloudSettings?.warnings ?? []).map((w) => (
                  <p key={w.code} className="text-xs text-amber-800">
                    {w.message}
                  </p>
                ))}
              </div>
            ) : null}
          </SectionCard>

          {needsAttention.length > 0 ? (
            <SectionCard className="mb-6 border-amber-200">
              <PageHeader
                title={t("web.provider.settings.pages.sales/card-machines.needsAttention")}
                subtitle={t("web.provider.settings.pages.sales/card-machines.paymentsOrMachinesThatMayNeed")}
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReconcile()}
                    disabled={reconcileLoading}
                  >
                    <RefreshCw className={`me-2 h-4 w-4 ${reconcileLoading ? "animate-spin" : ""}`} />
{t("web.provider.settings.pages.sales/card-machines.checkPaymentStatus")}
                  </Button>
                }
              />
              <ul className="mt-3 space-y-2">
                {needsAttention.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <div>{item.label}</div>
                      {item.detail ? <div className="text-xs text-amber-700">{item.detail}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
              {exceptionPayments.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-start text-gray-500">
<th className="py-2 pe-2">{t("web.provider.settings.pages.sales/card-machines.order")}</th>
<th className="py-2 pe-2">{t("web.provider.common.statusLabel")}</th>
<th className="py-2 pe-2">{t("web.provider.common.amount")}</th>
<th className="py-2">{t("web.provider.settings.pages.sales/card-machines.match")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptionPayments.slice(0, 5).map((p) => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="py-2 pe-2 font-mono">{p.merchant_order_no}</td>
                          <td className="py-2 pe-2">{p.status}</td>
                          <td className="py-2 pe-2">
                            {p.currency} {Number(p.amount).toFixed(2)}
                          </td>
                          <td className="py-2 text-amber-700">{p.amount_match_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {terminalShopEnabled && paycloudTerminals.length === 0 && !pendingOrder ? (
            <SectionCard className="mb-6 overflow-hidden border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50/60">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-pink-100">
                    <Smartphone className="h-6 w-6 text-pink-500" />
                  </div>
                  <div>
<div className="font-semibold text-gray-900">{t("web.provider.settings.pages.sales/card-machines.getFirstCardMachine")}</div>
                    <p className="mt-0.5 text-sm text-gray-600">
{t("web.provider.settings.pages.sales/card-machines.orderFromCatalog")}
                    </p>
                  </div>
                </div>
                <Button asChild>
                  <Link href="/provider/settings/sales/terminal-shop">
                    <ShoppingBag className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.browseMachines")}
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard className="mb-6">
            <PageHeader
              title={t("web.provider.settings.pages.sales/card-machines.beautonomiCardMachines")}
              subtitle={t("web.provider.settings.pages.sales/card-machines.addNameAndAssignMachinesFor")}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.addMachine")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
<DialogTitle>{t("web.provider.settings.pages.sales/card-machines.addCardMachine")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div>
        <Label>{t("web.provider.settings.pages.sales/card-machines.serialNumber")}</Label>
                          <Input
                            value={form.terminal_sn}
                            onChange={(e) => setForm((f) => ({ ...f, terminal_sn: e.target.value }))}
                            placeholder={t("web.provider.settings.pages.sales/card-machines.fromDeviceLabelOrActivationEmail")}
                          />
                        </div>
                        <div>
        <Label>{t("web.provider.settings.pages.sales/card-machines.displayName")}</Label>
                          <Input
                            value={form.display_name}
                            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                            placeholder={t("web.provider.settings.pages.sales/card-machines.frontDeskPortableEtc")}
                          />
                        </div>
                        <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.location")}</Label>
                          <Select
                            value={form.location_id || "portable"}
                            onValueChange={(v) => setForm((f) => ({ ...f, location_id: v === "portable" ? "" : v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
<SelectItem value="portable">{t("web.provider.settings.pages.sales/card-machines.portableAllLocations")}</SelectItem>
                              {salons.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
<Button onClick={handleAddTerminal}>{t("web.provider.common.save")}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              }
            />

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">{t("web.provider.settings.pages.sales/card-machines.acceptInPersonCardPayments")}</div>
<div className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/card-machines.showCardMachineAtCheckout")}</div>
                </div>
                <Switch checked={acceptPaycloud} onCheckedChange={handleAcceptToggle} />
              </div>

              {qrFlagEnabled ? (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
<div className="font-medium">{t("web.provider.settings.pages.sales/card-machines.walletQrPayments")}</div>
<div className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/card-machines.walletQrPaymentsHint")}</div>
                  </div>
                  <Switch
                    checked={paycloudSettings?.qr_payments_enabled ?? false}
                    onCheckedChange={handleQrToggle}
                  />
                </div>
              ) : null}

              {cashbackFlagEnabled ? (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
<div className="font-medium">{t("web.provider.settings.pages.sales/card-machines.cashback")}</div>
<div className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/card-machines.cashbackHint")}</div>
                  </div>
                  <Switch
                    checked={paycloudSettings?.cashback_enabled ?? false}
                    onCheckedChange={handleCashbackToggle}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-6 space-y-3">
              {paycloudTerminals.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-600">
                  <Smartphone className="mx-auto mb-2 h-8 w-8 text-gray-400" />
<p>{t("web.provider.settings.pages.sales/card-machines.addExistingOrOrder")}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                      <Plus className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.addExistingMachine")}
                    </Button>
                    {terminalShopEnabled ? (
                      <Button size="sm" asChild>
                        <Link href="/provider/settings/sales/terminal-shop">
                          <ShoppingBag className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.orderFromShop")}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                paycloudTerminals.map((terminal) => (
                  <div key={terminal.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <CreditCard className="mt-0.5 h-5 w-5 text-gray-500" />
                      <div>
                        <div className="font-medium">{terminal.display_name}</div>
                        <div className="text-xs text-gray-500">{t("web.provider.settings.pages.sales/card-machines.serialLabel", { sn: terminal.terminal_sn })}</div>
                        <div className="text-xs text-gray-500">
                          {terminal.location_name ?? t("web.provider.settings.pages.sales/card-machines.portable")} · {t("web.provider.settings.pages.sales/card-machines.paymentsCount", { count: terminal.total_transactions ?? 0 })}
                        </div>
                        {terminal.merchant ? (
                          <div className="text-xs text-gray-400">
                            {t("web.provider.settings.pages.sales/card-machines.merchantStore", { merchant: terminal.merchant.merchant_no, store: terminal.merchant.store_no })}
                            {terminal.merchant.label ? ` (${terminal.merchant.label})` : ""}
                          </div>
                        ) : (
                          <div className="text-xs text-amber-600">{t("web.provider.settings.pages.sales/card-machines.merchantSetupPending")}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{t("web.provider.common.active")}</span>
                        <Switch
                          checked={terminal.is_active}
                          onCheckedChange={(checked) => void handleToggleActive(terminal, checked)}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(terminal)} aria-label={t("web.provider.settings.pages.sales/card-machines.editCardMachineAria")}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("web.provider.settings.pages.sales/card-machines.removeCardMachineAria")}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("web.provider.settings.pages.sales/card-machines.removeCardMachineTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("web.provider.settings.pages.sales/card-machines.removeCardMachineBody", { name: terminal.display_name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("web.provider.common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDeleteTerminal(terminal)}>
                              {t("web.provider.settings.pages.sales/card-machines.remove")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard className="mb-6">
            <PageHeader
              title={t("web.provider.settings.pages.sales/card-machines.recentCardPayments")}
              subtitle={t("web.provider.settings.pages.sales/card-machines.latestChargesSentToYourCard")}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReconcile()}
                  disabled={reconcileLoading}
                >
                  <RefreshCw className={`me-2 h-4 w-4 ${reconcileLoading ? "animate-spin" : ""}`} />
                  {t("web.provider.settings.pages.sales/card-machines.checkPaymentStatus")}
                </Button>
              }
            />
            {recentPayments.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
{t("web.provider.settings.pages.sales/card-machines.noCardPaymentsYet")}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-start text-xs text-gray-500">
<th className="py-2 pe-2">{t("web.provider.settings.pages.sales/card-machines.time")}</th>
<th className="py-2 pe-2">{t("web.provider.settings.pages.sales/card-machines.order")}</th>
<th className="py-2 pe-2">{t("web.provider.common.amount")}</th>
<th className="py-2 pe-2">{t("web.provider.common.statusLabel")}</th>
<th className="py-2">{t("web.provider.settings.pages.sales/card-machines.match")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-2 pe-2 text-xs text-gray-500">
                          {new Date(p.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pe-2 font-mono text-xs">{p.merchant_order_no}</td>
                        <td className="py-2 pe-2">
                          {p.currency} {Number(p.amount).toFixed(2)}
                        </td>
                        <td className="py-2 pe-2 capitalize">{p.status.replace(/_/g, " ")}</td>
                        <td className="py-2 text-xs text-gray-600">{p.amount_match_status ?? t("web.provider.common.emDash")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {terminalShopEnabled && paycloudTerminals.length > 0 ? (
            <SectionCard className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
<div className="font-medium text-gray-900">{t("web.provider.settings.pages.sales/card-machines.needAnotherMachine")}</div>
                  <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.sales/card-machines.orderThenActivate")}
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/provider/settings/sales/terminal-shop">
                    <ShoppingBag className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.openTerminalShop")}
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard className="mb-6">
            <details className="group">
<summary className="cursor-pointer list-none text-sm font-medium text-gray-700">
                {t("web.provider.settings.pages.sales/card-machines.account")}
                {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment) ? (
                  <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)}
                  </span>
                ) : null}
              </summary>
              <p className="mt-2 text-xs text-gray-500">
{t("web.provider.settings.pages.sales/card-machines.accountReadOnly")}
              </p>
            </details>
          </SectionCard>

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
<DialogTitle>{t("web.provider.settings.pages.sales/card-machines.editCardMachine")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.serialNumber")}</Label>
                  <Input value={editingTerminal?.terminal_sn ?? ""} disabled className="bg-gray-50" />
                </div>
                <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.displayName")}</Label>
                  <Input
                    value={editForm.display_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                  />
                </div>
                <div>
<Label>{t("web.provider.settings.pages.sales/card-machines.location")}</Label>
                  <Select
                    value={editForm.location_id || "portable"}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, location_id: v === "portable" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
<SelectItem value="portable">{t("web.provider.settings.pages.sales/card-machines.portableAllLocations")}</SelectItem>
                      {salons.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
<Button onClick={handleEditTerminal}>{t("web.provider.settings.pages.sales/card-machines.saveChanges")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <SectionCard>
<p className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/card-machines.notAvailableInMarket")}</p>
          {terminalShopEnabled ? (
            <Button asChild className="mt-4" variant="outline">
              <Link href="/provider/settings/sales/terminal-shop">
                <ShoppingBag className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.sales/card-machines.orderFromTerminalShop")}
              </Link>
            </Button>
          ) : null}
        </SectionCard>
      )}

      {yocoEnabled ? (
        <SectionCard className="mt-6">
          <PageHeader title={t("web.provider.settings.pages.sales/card-machines.yoco")} subtitle={t("web.provider.settings.pages.sales/card-machines.separateYocoWebPosIntegration")} />
          <Button variant="outline" asChild className="mt-3">
<Link href="/provider/settings/sales/yoco-integration">{t("web.provider.settings.pages.sales/card-machines.openYocoSettings")}</Link>
          </Button>
        </SectionCard>
      ) : null}
      <SectionCard className="mt-8 border-dashed bg-slate-50 p-4">
<h3 className="font-semibold text-gray-900">{t("web.provider.settings.pages.sales/terminal-integrations/vendor.setupGuide")}</h3>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-gray-600">
<li>{t("web.provider.settings.pages.sales/card-machines.setupGuideTurnOn")} <strong>{t("web.provider.settings.pages.sales/card-machines.acceptInPersonCardPayments")}</strong> {t("web.provider.settings.pages.sales/card-machines.setupGuideAbove")}</li>
<li>{t("web.provider.settings.pages.sales/card-machines.setupGuideAddSerial")}</li>
<li>{t("web.provider.settings.pages.sales/card-machines.setupGuideCloudMode")} <strong>{t("web.provider.settings.pages.sales/card-machines.cloudMode")}</strong> {t("web.provider.settings.pages.sales/card-machines.setupGuideCloudModeRest")}</li>
<li>{t("web.provider.settings.pages.sales/card-machines.setupGuideCheckout")} <strong>{t("web.provider.settings.pages.sales/card-machines.cardMachine")}</strong> {t("web.provider.settings.pages.sales/card-machines.setupGuideCheckoutRest")}</li>
<li>{t("web.provider.settings.pages.sales/card-machines.setupGuideRefunds")}</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
{t("web.provider.settings.pages.sales/card-machines.cardMachinePayoutsNote")}
        </p>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
