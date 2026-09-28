import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { BrandBriefStrategyPickers } from "@/components/brand/BrandBriefStrategyPickers";

type Props = {
  campaignId: string;
  initial: {
    name: string;
    objective: string;
    budget_envelope: string;
    flight_start: string;
    flight_end: string;
    success_target: string;
    pillar_id: string;
    plan_id: string;
  };
  onSaved: () => void;
};

export function BrandCampaignEditForm({ campaignId, initial, onSaved }: Props) {
  const [form, setForm] = useState(initial);

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/brand/campaigns/${campaignId}`, {
        name: form.name.trim(),
        objective: form.objective || undefined,
        budget_envelope: form.budget_envelope ? Number(form.budget_envelope) : undefined,
        flight_start: form.flight_start || undefined,
        flight_end: form.flight_end || undefined,
        success_target: form.success_target ? Number(form.success_target) : undefined,
        pillar_id: form.pillar_id || null,
        plan_id: form.plan_id || null,
      }),
    onSuccess: () => {
      adminToast.success("Campaign updated");
      onSaved();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  return (
    <AdminPanel title="Campaign settings">
      <form
        className="grid gap-3 md:grid-cols-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
      >
        <div className="md:col-span-2">
          <p className="mb-2 text-zinc-600">Strategy link</p>
          <BrandBriefStrategyPickers
            pillarId={form.pillar_id}
            planId={form.plan_id}
            onPillarChange={(pillar_id) => setForm((f) => ({ ...f, pillar_id, plan_id: "" }))}
            onPlanChange={(plan_id) => setForm((f) => ({ ...f, plan_id }))}
          />
        </div>
        <label className="block md:col-span-2">
          Name
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="block md:col-span-2">
          Objective
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={2}
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
          />
        </label>
        <label className="block">
          Budget envelope
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.budget_envelope}
            onChange={(e) => setForm((f) => ({ ...f, budget_envelope: e.target.value }))}
          />
        </label>
        <label className="block">
          Success target
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.success_target}
            onChange={(e) => setForm((f) => ({ ...f, success_target: e.target.value }))}
          />
        </label>
        <label className="block">
          Flight start
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.flight_start}
            onChange={(e) => setForm((f) => ({ ...f, flight_start: e.target.value }))}
          />
        </label>
        <label className="block">
          Flight end
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.flight_end}
            onChange={(e) => setForm((f) => ({ ...f, flight_end: e.target.value }))}
          />
        </label>
        <p className="md:col-span-2 text-xs text-zinc-500">Audience definition is edited on the Audience tab.</p>
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded bg-violet-700 px-3 py-1.5 text-white md:col-span-2 md:w-fit disabled:opacity-50"
        >
          Save campaign
        </button>
      </form>
    </AdminPanel>
  );
}
