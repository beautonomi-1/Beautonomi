"use client";

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
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  label: string;
}> = [
  { code: "PLAN_REQUIRED", label: "Plan includes card machines" },
  { code: "NOT_ACCEPTED", label: "Accept in-person card payments" },
  { code: "NO_TERMINALS", label: "Add a card machine" },
  { code: "ALL_SUSPENDED", label: "At least one active machine" },
  { code: "NO_MERCHANT", label: "Merchant setup complete" },
];

type PendingTerminalOrder = {
  id: string;
  order_status: string;
  invoice_status: string;
  integration_setup_status?: string | null;
  fulfillment_type?: string | null;
  terminal_products?: { name?: string; vendor?: string };
};

export default function CardMachinesPage() {
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
  const [activationSerial, setActivationSerial] = useState("");
  const [activationName, setActivationName] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    void loadData();
  }, [paycloudEnabled, yocoEnabled]);

  useEffect(() => {
    if (!terminalEcommerceEnabled) {
      setPendingOrder(null);
      return;
    }

    const isPendingActivation = (order: PendingTerminalOrder | undefined | null) => {
      if (!order) return false;
      if (order.invoice_status !== "paid" || order.integration_setup_status !== "pending") {
        return false;
      }
      const vendor = (order.terminal_products?.vendor ?? "").toLowerCase();
      // Prefer PayCloud / Beautonomi card-machine orders; allow unknown vendor when deep-linked.
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
            setActivationName(order!.terminal_products?.name ?? "Card machine");
            return;
          }
        }

        const listRes = await fetcher.get<{ data: { orders: PendingTerminalOrder[] } }>(
          "/api/provider/terminal-orders",
        );
        const pending = (listRes.data?.orders ?? []).find((o) => isPendingActivation(o));
        if (pending) {
          setPendingOrder(pending);
          setActivationName(pending.terminal_products?.name ?? "Card machine");
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
      toast.error("Failed to load card machines");
    } finally {
      setLoading(false);
    }
  };

  const blockers = paycloudSettings?.blockers ?? [];
  const blockerCodes = new Set(blockers.map((b) => b.code));
  const setupProgress = useMemo(() => {
    const steps = SETUP_STEPS.filter((s) => s.code !== "FLAG_OFF");
    const done = steps.filter((s) => !blockerCodes.has(s.code)).length;
    return { done, total: steps.length };
  }, [blockerCodes]);

  const planBlocker = blockers.find((b) => b.code === "PLAN_REQUIRED");
  const needsAttention = useMemo(() => {
    const items: Array<{ id: string; label: string; detail?: string }> = [];
    const inFlight = paycloudSettings?.terminals?.inFlight ?? 0;
    if (inFlight > 0) {
      items.push({
        id: "in-flight",
        label: `${inFlight} payment${inFlight === 1 ? "" : "s"} waiting on card machine`,
        detail: "Check status to sync with PayCloud",
      });
    }
    if (reconcileExceptions > 0) {
      items.push({
        id: "exceptions",
        label: `${reconcileExceptions} amount mismatch${reconcileExceptions === 1 ? "" : "es"}`,
        detail: "Review recent card machine payments below",
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
      toast.error("Serial number and name are required");
      return;
    }
    try {
      await paycloudApi.createTerminal({
        terminal_sn: form.terminal_sn.trim(),
        display_name: form.display_name.trim(),
        location_id: form.location_id || null,
      });
      toast.success("Card machine added");
      setDialogOpen(false);
      setForm({ terminal_sn: "", display_name: "", location_id: "" });
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add card machine");
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
      toast.error("Display name is required");
      return;
    }
    try {
      await paycloudApi.updateTerminal(editingTerminal.id, {
        display_name: editForm.display_name.trim(),
        location_id: editForm.location_id || null,
      });
      toast.success("Card machine updated");
      setEditDialogOpen(false);
      setEditingTerminal(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update card machine");
    }
  };

  const handleToggleActive = async (terminal: PaycloudTerminal, checked: boolean) => {
    try {
      await paycloudApi.updateTerminal(terminal.id, { is_active: checked });
      setPaycloudTerminals((prev) =>
        prev.map((t) => (t.id === terminal.id ? { ...t, is_active: checked } : t)),
      );
      toast.success(checked ? "Card machine is now active" : "Card machine hidden from checkout");
      await loadData();
    } catch {
      toast.error("Failed to update card machine");
    }
  };

  const handleDeleteTerminal = async (terminal: PaycloudTerminal) => {
    try {
      await paycloudApi.deleteTerminal(terminal.id);
      toast.success("Card machine removed");
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove card machine");
    }
  };

  const handleActivateOrder = async () => {
    if (!activationSerial.trim()) {
      toast.error("Enter the serial number from your device label");
      return;
    }
    setActivating(true);
    try {
      await paycloudApi.createTerminal({
        terminal_sn: activationSerial.trim(),
        display_name: activationName.trim() || `Card machine ${activationSerial.trim().slice(-4)}`,
      });
      toast.success("Card machine activated");
      setActivationSerial("");
      setPendingOrder(null);
      await loadData();
      if (!paycloudSettings?.accept_paycloud) {
        toast.message("Turn on Accept in-person card payments to start collecting.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to activate card machine");
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
      toast.success(checked ? "In-person card payments enabled" : "In-person card payments disabled");
      await loadData();
    } catch {
      toast.error("Failed to update settings");
    }
  };

  const handleQrToggle = async (checked: boolean) => {
    try {
      await paycloudApi.updateSettings({ qr_payments_enabled: checked });
      setPaycloudSettings((prev) =>
        prev ? { ...prev, qr_payments_enabled: checked } : prev,
      );
      toast.success(checked ? "Wallet QR payments enabled" : "Wallet QR payments disabled");
    } catch {
      toast.error("Failed to update settings");
    }
  };

  const handleCashbackToggle = async (checked: boolean) => {
    try {
      await paycloudApi.updateSettings({ cashback_enabled: checked });
      setPaycloudSettings((prev) =>
        prev ? { ...prev, cashback_enabled: checked } : prev,
      );
      toast.success(checked ? "Cashback enabled" : "Cashback disabled");
    } catch {
      toast.error("Failed to update settings");
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
      toast.error(e?.message || "Failed to check payment status");
    } finally {
      setReconcileLoading(false);
    }
  };

  if (loading) {
    return <LoadingTimeout loadingMessage="Loading card machines..." />;
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Card machines" },
  ];

  const acceptPaycloud = paycloudSettings?.accept_paycloud ?? false;
  const activePaycloud = paycloudTerminals.filter((t) => t.is_active).length;
  const activeYoco = yocoDevices.filter((d) => d.is_active).length;
  const statusLabel = paycloudSettings?.ready
    ? "Ready"
    : acceptPaycloud
      ? "Setup incomplete"
      : "Not accepting";
  const recentPayments = reconcilePayments.slice(0, 10);
  const exceptionPayments = reconcilePayments.filter(
    (p) =>
      p.amount_match_status &&
      p.amount_match_status !== "exact" &&
      p.amount_match_status !== "pending",
  );

  return (
    <SettingsDetailLayout
      title="Card machines"
      subtitle="Beautonomi in-person terminals — tap, insert, swipe, and QR wallets"
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SectionCard className="p-4">
          <div className="text-xs text-gray-500">Status</div>
          <div className="text-2xl font-semibold">{statusLabel}</div>
          <div className="text-sm text-gray-600">
            {activePaycloud} active machine{activePaycloud === 1 ? "" : "s"}
            {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)
              ? ` · ${paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)}`
              : ""}
          </div>
        </SectionCard>
        <SectionCard className="p-4 sm:col-span-2">
          <div className="text-xs text-gray-500">Beautonomi card machines</div>
          <div className="text-sm text-gray-600">
            {paycloudSettings?.ready
              ? "Ready for checkout at bookings and sales"
              : acceptPaycloud
                ? "Finish setup below to start collecting"
                : "Turn on acceptance to show Card machine at checkout"}
          </div>
        </SectionCard>
        {yocoEnabled ? (
          <SectionCard className="p-4">
            <div className="text-xs text-gray-500">Yoco devices</div>
            <div className="text-2xl font-semibold">{activeYoco}</div>
            <Link href="/provider/settings/sales/yoco-devices" className="text-sm text-pink-600 hover:underline">
              Manage Yoco →
            </Link>
          </SectionCard>
        ) : null}
        {paystackTerminalEnabled ? (
          <SectionCard className="p-4">
            <div className="text-xs text-gray-500">Paystack Terminal</div>
            <div className="text-sm text-gray-600">QR & link payments</div>
            <Link href="/provider/settings/sales/paystack-terminal" className="text-sm text-pink-600 hover:underline">
              Open settings →
            </Link>
          </SectionCard>
        ) : null}
      </div>

      {paycloudEnabled ? (
        <>
          {planBlocker ? (
            <SectionCard className="mb-6 border-amber-200 bg-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-amber-950">{planBlocker.title}</div>
                  <div className="text-sm text-amber-800">
                    Upgrade your plan to add card machines and collect in-person payments.
                  </div>
                </div>
                <Button asChild>
                  <Link href={planBlocker.href ?? "/provider/subscription"}>
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Upgrade plan
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {pendingOrder ? (
            <SectionCard className="mb-6 border-pink-200 bg-pink-50/40">
              <PageHeader
                title="Activate your new card machine"
                subtitle={
                  pendingOrder.terminal_products?.name
                    ? `Order: ${pendingOrder.terminal_products.name}`
                    : "Enter the serial number to finish setup"
                }
              />
              <p className="mt-2 text-sm text-gray-600">
                Find the serial number on the device label or in your activation email, then add it below.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Serial number</Label>
                  <Input
                    className="mt-1"
                    value={activationSerial}
                    onChange={(e) => setActivationSerial(e.target.value)}
                    placeholder="From device label"
                  />
                </div>
                <div>
                  <Label>Display name</Label>
                  <Input
                    className="mt-1"
                    value={activationName}
                    onChange={(e) => setActivationName(e.target.value)}
                    placeholder="Front desk, Portable, etc."
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void handleActivateOrder()} disabled={activating}>
                  {activating ? "Activating…" : "Activate machine"}
                </Button>
                {!acceptPaycloud ? (
                  <Button variant="outline" onClick={() => void handleAcceptToggle(true)}>
                    Enable acceptance
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard className="mb-6">
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-gray-700">
                Account
                {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment) ? (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {paycloudAccountEnvironmentLabel(paycloudSettings?.account_environment)}
                  </span>
                ) : null}
              </summary>
              <p className="mt-2 text-xs text-gray-500">
                Read-only. Beautonomi configures test or live card machine accounts — you cannot switch here.
              </p>
            </details>
          </SectionCard>

          <SectionCard className="mb-6">
            <PageHeader
              title="Setup checklist"
              subtitle={`${setupProgress.done} of ${setupProgress.total} done`}
            />
            <div className="mt-4 space-y-2">
              {SETUP_STEPS.filter((s) => s.code !== "FLAG_OFF").map((step) => {
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
                        {step.label}
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
                title="Needs attention"
                subtitle="Payments or machines that may need a look"
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReconcile()}
                    disabled={reconcileLoading}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${reconcileLoading ? "animate-spin" : ""}`} />
                    Check payment status
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
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-2">Order</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 pr-2">Amount</th>
                        <th className="py-2">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptionPayments.slice(0, 5).map((p) => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="py-2 pr-2 font-mono">{p.merchant_order_no}</td>
                          <td className="py-2 pr-2">{p.status}</td>
                          <td className="py-2 pr-2">
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

          <SectionCard>
            <PageHeader
              title="Beautonomi card machines"
              subtitle="Add, name, and assign machines for checkout and house calls"
              actions={
                <div className="flex flex-wrap gap-2">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add machine
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add card machine</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div>
                          <Label>Serial number</Label>
                          <Input
                            value={form.terminal_sn}
                            onChange={(e) => setForm((f) => ({ ...f, terminal_sn: e.target.value }))}
                            placeholder="From device label or activation email"
                          />
                        </div>
                        <div>
                          <Label>Display name</Label>
                          <Input
                            value={form.display_name}
                            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                            placeholder="Front desk, Portable, etc."
                          />
                        </div>
                        <div>
                          <Label>Location</Label>
                          <Select
                            value={form.location_id || "portable"}
                            onValueChange={(v) => setForm((f) => ({ ...f, location_id: v === "portable" ? "" : v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="portable">Portable (all locations)</SelectItem>
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
                        <Button onClick={handleAddTerminal}>Save</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              }
            />

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Accept in-person card payments</div>
                  <div className="text-sm text-gray-600">Show Beautonomi card machine at checkout when terminals are active</div>
                </div>
                <Switch checked={acceptPaycloud} onCheckedChange={handleAcceptToggle} />
              </div>

              {qrFlagEnabled ? (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">Wallet QR payments</div>
                    <div className="text-sm text-gray-600">Let customers pay with mobile wallet QR on the device</div>
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
                    <div className="font-medium">Cashback</div>
                    <div className="text-sm text-gray-600">Offer cashback when charging on the card machine</div>
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
                  Add a machine you already have, or order one from the terminal shop.
                </div>
              ) : (
                paycloudTerminals.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <CreditCard className="mt-0.5 h-5 w-5 text-gray-500" />
                      <div>
                        <div className="font-medium">{t.display_name}</div>
                        <div className="text-xs text-gray-500">Serial {t.terminal_sn}</div>
                        <div className="text-xs text-gray-500">
                          {t.location_name ?? "Portable"} · {t.total_transactions ?? 0} payments
                        </div>
                        {t.merchant ? (
                          <div className="text-xs text-gray-400">
                            Merchant {t.merchant.merchant_no} · Store {t.merchant.store_no}
                            {t.merchant.label ? ` (${t.merchant.label})` : ""}
                          </div>
                        ) : (
                          <div className="text-xs text-amber-600">Merchant setup pending</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Active</span>
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(checked) => void handleToggleActive(t, checked)}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Edit card machine">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Remove card machine">
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove card machine?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove &quot;{t.display_name}&quot; from your account. You can add it again later with the same serial number.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDeleteTerminal(t)}>
                              Remove
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
              title="Recent card payments"
              subtitle="Latest charges sent to your card machines"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReconcile()}
                  disabled={reconcileLoading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${reconcileLoading ? "animate-spin" : ""}`} />
                  Check payment status
                </Button>
              }
            />
            {recentPayments.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No card machine payments yet. Collect at a booking or sale to see them here.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Time</th>
                      <th className="py-2 pr-2">Order</th>
                      <th className="py-2 pr-2">Amount</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-xs text-gray-500">
                          {new Date(p.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">{p.merchant_order_no}</td>
                        <td className="py-2 pr-2">
                          {p.currency} {Number(p.amount).toFixed(2)}
                        </td>
                        <td className="py-2 pr-2 capitalize">{p.status.replace(/_/g, " ")}</td>
                        <td className="py-2 text-xs text-gray-600">{p.amount_match_status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {terminalShopEnabled ? (
            <SectionCard className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">Shop card machines</div>
                  <p className="text-sm text-gray-600">
                    Order from the Beautonomi catalog, then activate with the serial number here.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/provider/settings/sales/terminal-shop">
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Open terminal shop
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : null}

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit card machine</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Serial number</Label>
                  <Input value={editingTerminal?.terminal_sn ?? ""} disabled className="bg-gray-50" />
                </div>
                <div>
                  <Label>Display name</Label>
                  <Input
                    value={editForm.display_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Select
                    value={editForm.location_id || "portable"}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, location_id: v === "portable" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portable">Portable (all locations)</SelectItem>
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
                <Button onClick={handleEditTerminal}>Save changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <SectionCard>
          <p className="text-sm text-gray-600">Beautonomi card machines are not available in your market yet.</p>
          {terminalShopEnabled ? (
            <Button asChild className="mt-4" variant="outline">
              <Link href="/provider/settings/sales/terminal-shop">
                <ShoppingBag className="mr-2 h-4 w-4" />
                Order from Terminal Shop
              </Link>
            </Button>
          ) : null}
        </SectionCard>
      )}

      {yocoEnabled ? (
        <SectionCard className="mt-6">
          <PageHeader title="Yoco" subtitle="Separate Yoco Web POS integration" />
          <Button variant="outline" asChild className="mt-3">
            <Link href="/provider/settings/sales/yoco-integration">Open Yoco settings</Link>
          </Button>
        </SectionCard>
      ) : null}
      <SectionCard className="mt-8 border-dashed bg-slate-50 p-4">
        <h3 className="font-semibold text-gray-900">Setup guide</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Turn on <strong>Accept in-person card payments</strong> above.</li>
          <li>Add your machine serial or order one from the terminal shop.</li>
          <li>On the device, open settings and turn on <strong>Cloud Mode</strong> so Beautonomi can send charges.</li>
          <li>At checkout, choose <strong>Card machine</strong> — customer taps, inserts, swipes, or scans QR.</li>
          <li>Refunds are done on the physical machine, then recorded in Beautonomi.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          Card machine payments stay in your merchant account — not Beautonomi online payouts.
        </p>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
