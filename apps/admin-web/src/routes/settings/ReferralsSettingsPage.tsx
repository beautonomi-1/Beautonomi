import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type ReferralSettings = {
  referral_amount?: number;
  referral_message?: string;
  referral_currency?: string;
  is_enabled?: boolean;
};

type FaqRow = { id: string; question?: string; answer?: string | null; display_order?: number; is_active?: boolean };

export function ReferralsSettingsPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const [form, setForm] = useState<ReferralSettings>({});
  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.referrals(),
    queryFn: () => adminApi.getJson<ReferralSettings>("/api/admin/referrals", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const faqsQ = useQuery({
    queryKey: adminQueryKeys.referralFaqs(),
    queryFn: () => adminApi.getJson<FaqRow[]>("/api/admin/referrals/faqs", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.patchJson<ReferralSettings>("/api/admin/referrals", {
        referral_amount: Number(form.referral_amount ?? 0),
        referral_message: form.referral_message,
        referral_currency: form.referral_currency,
        is_enabled: form.is_enabled,
      }),
    onSuccess: async () => {
      setMsg("Referral settings saved.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referrals() });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Save failed"),
  });

  const addFaq = useMutation({
    mutationFn: () =>
      adminApi.postJson<FaqRow>("/api/admin/referrals/faqs", {
        question: faqQ.trim(),
        answer: faqA.trim(),
        answer_type: "text" as const,
        display_order: (faqsQ.data?.length ?? 0) * 10,
        is_active: true,
      }),
    onSuccess: async () => {
      setFaqQ("");
      setFaqA("");
      setMsg("FAQ added.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referralFaqs() });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "FAQ create failed"),
  });

  const delFaq = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/referrals/faqs/${id}`),
    onSuccess: async () => {
      setMsg("FAQ removed.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referralFaqs() });
    },
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Referral settings" />
        <AdminPanel>
          <AdminPageSkeleton rows={3} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const faqs = Array.isArray(faqsQ.data) ? faqsQ.data : [];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Referral program"
        description="Reward amounts and copy for the resolved tenant, plus referral FAQs shown in apps (when the referral_faqs table exists)."
      />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="text-gray-600">Amount</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2"
            value={form.referral_amount ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, referral_amount: parseFloat(e.target.value) || 0 }))}
          />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Currency (ISO 4217)</span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 font-mono uppercase"
            maxLength={3}
            value={form.referral_currency ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, referral_currency: e.target.value.toUpperCase() }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.is_enabled !== false}
            onChange={(e) => setForm((p) => ({ ...p, is_enabled: e.target.checked }))}
          />
          Program enabled
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-gray-600">Message</span>
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-lg border border-gray-200 px-2 py-2"
            value={form.referral_message ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, referral_message: e.target.value }))}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 md:col-span-2"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save referral settings"}
        </button>
      </AdminPanel>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Referral FAQs</h2>
        <AdminPanel className="space-y-3">
          <input
            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
            placeholder="Question"
            value={faqQ}
            onChange={(e) => setFaqQ(e.target.value)}
          />
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
            placeholder="Answer"
            value={faqA}
            onChange={(e) => setFaqA(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={addFaq.isPending || !faqQ.trim() || !faqA.trim()}
            onClick={() => addFaq.mutate()}
          >
            Add FAQ
          </button>
        </AdminPanel>
        {faqsQ.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : faqsQ.error ? (
          <p className="text-sm text-gray-500">FAQs unavailable: {faqsQ.error.message}</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm text-gray-500">No FAQs yet.</p>
        ) : (
          <ul className="space-y-2">
            {faqs.map((f) => (
              <li key={f.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-gray-900">{f.question}</p>
                  <button
                    type="button"
                    className="text-sm text-rose-700 hover:underline"
                    onClick={() => {
                      if (confirm("Delete this FAQ?")) delFaq.mutate(f.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{f.answer ?? ""}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
