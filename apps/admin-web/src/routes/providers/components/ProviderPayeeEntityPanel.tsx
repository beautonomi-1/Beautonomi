import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";

type PayeeEntity = {
  payee_kind?: string | null;
  registered_business_name?: string | null;
  business_registration_number?: string | null;
  business_registration_country?: string | null;
  verified_person_role?: string | null;
  kyb_verification_status?: string | null;
};

export function ProviderPayeeEntityPanel({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [...adminQueryKeys.providers.detail(providerId), "payee-entity"],
    queryFn: () => adminApi.getJson<PayeeEntity>(`/api/admin/providers/${providerId}/payee-entity`),
  });

  const [form, setForm] = useState<PayeeEntity | null>(null);
  const entity = form ?? data ?? {};

  const save = useMutation({
    mutationFn: (payload: PayeeEntity) =>
      adminApi.patchJson(`/api/admin/providers/${providerId}/payee-entity`, payload),
    onSuccess: () => {
      adminToast.success("Payee entity updated");
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.providers.detail(providerId), "payee-entity"] });
      setForm(null);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (isLoading) return null;

  return (
    <AdminPanel>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">Payee entity & KYB</h3>
        <p className="text-sm text-muted-foreground">
          How this provider is set up for payouts and business verification.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Entity type</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={entity.payee_kind ?? "individual"}
            onChange={(e) => setForm({ ...entity, payee_kind: e.target.value })}
          >
            <option value="individual">Individual / sole prop</option>
            <option value="business">Registered business</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">KYB status</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={entity.kyb_verification_status ?? "not_started"}
            onChange={(e) => setForm({ ...entity, kyb_verification_status: e.target.value })}
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="not_required">Not required</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Registered business name</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={entity.registered_business_name ?? ""}
            onChange={(e) => setForm({ ...entity, registered_business_name: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Registration number</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={entity.business_registration_number ?? ""}
            onChange={(e) => setForm({ ...entity, business_registration_number: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Registration country</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={entity.business_registration_country ?? ""}
            onChange={(e) => setForm({ ...entity, business_registration_country: e.target.value })}
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={save.isPending || !form}
        onClick={() => form && save.mutate(form)}
      >
        {save.isPending ? "Saving…" : "Save payee entity"}
      </button>
    </AdminPanel>
  );
}
