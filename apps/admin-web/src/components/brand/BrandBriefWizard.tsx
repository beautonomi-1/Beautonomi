import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { BrandBriefEditForm, type BrandBriefFormValues } from "@/routes/brand/BrandBriefEditForm";

type Props = {
  briefId: string;
  initial: BrandBriefFormValues;
  readOnly?: boolean;
  onSaved: () => void;
};

function payloadFromForm(form: BrandBriefFormValues) {
  const fields = Object.fromEntries(
    Object.entries(form.extra_fields ?? {}).filter(([, v]) => v.trim() !== ""),
  );
  return {
    name: form.name.trim() || "Untitled brief",
    campaign_type: form.campaign_type,
    business_problem: form.business_problem || undefined,
    proposition: form.proposition || undefined,
    objective: form.objective || undefined,
    market_notes: form.market_notes || undefined,
    budget_envelope: form.budget_envelope ? Number(form.budget_envelope) : undefined,
    flight_start: form.flight_start || undefined,
    flight_end: form.flight_end || undefined,
    success_metric: form.success_metric,
    success_target: form.success_target ? Number(form.success_target) : undefined,
    channels_requested: form.channels_requested,
    notes: form.notes || undefined,
    ...(Object.keys(fields).length ? { fields } : {}),
    pillar_id: form.pillar_id || null,
    plan_id: form.plan_id || null,
  };
}

export function BrandBriefWizard({ briefId, initial, readOnly, onSaved }: Props) {
  const [form, setForm] = useState(initial);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schemaQ = useQuery({
    queryKey: [
      "brand-brief-schema",
      briefId,
      form.campaign_type,
      form.channels_requested.join(","),
      form.pillar_id,
      form.plan_id,
    ],
    queryFn: () =>
      adminApi.getJson<{
        quality_score: number;
        missing_required: string[];
      }>(`/api/admin/brand/briefs/${briefId}/schema`),
    enabled: !readOnly,
  });

  const versionsQ = useQuery({
    queryKey: ["brand-brief-versions", briefId, compareA, compareB],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (compareA && compareB) {
        qs.set("compare_a", compareA);
        qs.set("compare_b", compareB);
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return adminApi.getJson<{
        items: Array<{ version_number: number; created_at: string }>;
        diff: { changed_fields: string[] } | null;
      }>(`/api/admin/brand/briefs/${briefId}/versions${suffix}`);
    },
    enabled: !readOnly,
  });

  const autosaveMut = useMutation({
    mutationFn: (body: ReturnType<typeof payloadFromForm>) =>
      adminApi.postJson<{ version_number: number }>(`/api/admin/brand/briefs/${briefId}/autosave`, body),
    onSuccess: (data) => {
      setLastSavedAt(new Date().toISOString());
      void versionsQ.refetch();
      void schemaQ.refetch();
      onSaved();
      if (data?.version_number) {
        /* quiet autosave */
      }
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const scheduleAutosave = useCallback(
    (next: BrandBriefFormValues) => {
      if (readOnly) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        autosaveMut.mutate(payloadFromForm(next));
      }, 1200);
    },
    [autosaveMut, readOnly],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const boundSetForm = useCallback(
    (updater: BrandBriefFormValues | ((f: BrandBriefFormValues) => BrandBriefFormValues)) => {
      setForm((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        scheduleAutosave(next);
        return next;
      });
    },
    [scheduleAutosave],
  );

  const formState = useMemo(() => ({ form, setForm: boundSetForm }), [form, boundSetForm]);

  const assistMut = useMutation({
    mutationFn: (kind: "tighten_proposition" | "draft_from_idea" | "suggest_deliverables") =>
      adminApi.postJson<{ text: string }>(`/api/admin/brand/briefs/${briefId}/copilot-assist`, {
        kind,
        proposition: form.proposition,
        channels: form.channels_requested,
        campaign_type: form.campaign_type,
        idea: form.objective,
      }),
    onSuccess: (data, kind) => {
      boundSetForm((f) => {
        if (kind === "tighten_proposition" && data.text) {
          return { ...f, proposition: data.text };
        }
        if (kind === "draft_from_idea" && data.text) {
          return {
            ...f,
            objective: data.text.split("\n")[0]?.replace(/^Objective:\s*/, "") ?? f.objective,
          };
        }
        if (kind === "suggest_deliverables" && data.text) {
          return { ...f, notes: [f.notes, data.text].filter(Boolean).join("\n\n") };
        }
        return f;
      });
      adminToast.success("Suggestion applied — saving…");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (readOnly) {
    return <BrandBriefEditForm briefId={briefId} initial={initial} readOnly onSaved={onSaved} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm">
        <span className="font-medium text-violet-900">Brief wizard</span>
        {schemaQ.data ? (
          <span className="rounded bg-white px-2 py-0.5 text-xs tabular-nums">
            Completeness {schemaQ.data.quality_score}%
          </span>
        ) : null}
        {autosaveMut.isPending ? <span className="text-zinc-500">Saving…</span> : null}
        {lastSavedAt ? (
          <span className="text-xs text-zinc-500">Last autosave {lastSavedAt.slice(11, 19)}</span>
        ) : null}
        <button
          type="button"
          className="rounded border bg-white px-2 py-0.5 text-xs"
          onClick={() => assistMut.mutate("tighten_proposition")}
        >
          Copilot: tighten proposition
        </button>
        <button
          type="button"
          className="rounded border bg-white px-2 py-0.5 text-xs"
          onClick={() => assistMut.mutate("suggest_deliverables")}
        >
          Copilot: deliverables
        </button>
      </div>
      {(schemaQ.data?.missing_required?.length ?? 0) > 0 ? (
        <p className="text-xs text-amber-800">
          Required still empty: {schemaQ.data!.missing_required.slice(0, 6).join(", ")}
          {schemaQ.data!.missing_required.length > 6 ? "…" : ""}
        </p>
      ) : null}
      <BrandBriefEditForm
        briefId={briefId}
        initial={initial}
        readOnly={false}
        onSaved={onSaved}
        formState={formState}
        hideManualSave
      />
      <div className="rounded border p-3 text-sm">
        <p className="mb-2 font-medium">Version diff</p>
        <div className="mb-2 flex flex-wrap gap-2">
          <select className="rounded border px-2 py-1 text-xs" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
            <option value="">From v…</option>
            {(versionsQ.data?.items ?? []).map((v) => (
              <option key={v.version_number} value={String(v.version_number)}>
                v{v.version_number}
              </option>
            ))}
          </select>
          <select className="rounded border px-2 py-1 text-xs" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
            <option value="">To v…</option>
            {(versionsQ.data?.items ?? []).map((v) => (
              <option key={v.version_number} value={String(v.version_number)}>
                v{v.version_number}
              </option>
            ))}
          </select>
        </div>
        {versionsQ.data?.diff?.changed_fields?.length ? (
          <p className="text-zinc-600">Changed: {versionsQ.data.diff.changed_fields.join(", ")}</p>
        ) : compareA && compareB ? (
          <p className="text-zinc-500">No field changes between selected versions.</p>
        ) : (
          <p className="text-zinc-500">Pick two versions to compare.</p>
        )}
      </div>
    </div>
  );
}
