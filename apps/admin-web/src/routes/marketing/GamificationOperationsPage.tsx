import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const CONFIRM_BACKFILL = "BACKFILL_ALL";
const CONFIRM_INIT = "INITIALIZE_ALL";

type BackfillPayload = {
  message?: string;
  results?: unknown;
  total_providers?: number;
};

type InitPayload = {
  message?: string;
  providers_processed?: number;
};

type RecalcPayload = {
  message?: string;
  provider_id?: string;
  points?: unknown;
  badge_id?: unknown;
};

export function GamificationOperationsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const { bootstrap, isLoading: sessionLoading } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin ?? false;

  const [backfillPhrase, setBackfillPhrase] = useState("");
  const [initPhrase, setInitPhrase] = useState("");
  const [providerId, setProviderId] = useState("");
  const [lastBackfill, setLastBackfill] = useState<BackfillPayload | null>(null);
  const [lastInit, setLastInit] = useState<InitPayload | null>(null);
  const [lastRecalc, setLastRecalc] = useState<RecalcPayload | null>(null);

  const backfill = useMutation({
    mutationFn: () =>
      adminApi.postJson<BackfillPayload>("/api/admin/gamification/backfill", { confirm: CONFIRM_BACKFILL }, { timeoutMs: 120_000 }),
    onSuccess: (data) => setLastBackfill(data),
  });

  const initialize = useMutation({
    mutationFn: () =>
      adminApi.putJson<InitPayload>(
        "/api/admin/gamification/backfill/initialize",
        { confirm: CONFIRM_INIT },
        { timeoutMs: 120_000 }
      ),
    onSuccess: (data) => setLastInit(data),
  });

  const recalc = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson<RecalcPayload>(`/api/admin/gamification/providers/${encodeURIComponent(id)}/recalculate`, {}, { timeoutMs: 60_000 }),
    onSuccess: (data) => setLastRecalc(data),
  });

  if (denied) return denied;

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Gamification operations" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  const bfErr = backfill.error instanceof Error ? backfill.error.message : null;
  const initErr = initialize.error instanceof Error ? initialize.error.message : null;
  const recErr = recalc.error instanceof Error ? recalc.error.message : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Gamification · Operations"
        description="Platform-wide jobs are superadmin-only and audited. Per-provider recalculate is available to marketing admins."
      />

      <AdminPanel>
        <h2 className="text-sm font-semibold text-gray-900">Recalculate one provider</h2>
        <p className="mt-1 text-sm text-gray-600">
          Re-runs gamification scoring for a single provider (badges / points). Use after rule changes or data fixes.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Provider ID
            <input
              className="ml-2 w-72 rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={recalc.isPending || !providerId.trim()}
            onClick={() => recalc.mutate(providerId.trim())}
          >
            Recalculate
          </button>
        </div>
        {recErr ? <p className="mt-2 text-sm text-red-600">{recErr}</p> : null}
        {lastRecalc ? (
          <pre className="mt-3 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">{JSON.stringify(lastRecalc, null, 2)}</pre>
        ) : null}
      </AdminPanel>

      {!isSuperadmin ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">
            Platform-wide backfill and initialization are limited to <strong>superadmin</strong> accounts. Point rules and badges remain under Marketing
            &amp; comms for your role.
          </p>
        </AdminPanel>
      ) : (
        <>
          <AdminPanel>
            <h2 className="text-sm font-semibold text-gray-900">Backfill all providers</h2>
            <p className="mt-1 text-sm text-gray-600">
              Replays historical activity into provider point transactions across the platform. Type <code className="rounded bg-gray-100 px-1">{CONFIRM_BACKFILL}</code>{" "}
              to enable.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input
                className="w-64 rounded border border-gray-300 px-2 py-1 font-mono text-sm"
                value={backfillPhrase}
                onChange={(e) => setBackfillPhrase(e.target.value)}
                placeholder={CONFIRM_BACKFILL}
                autoComplete="off"
              />
              <button
                type="button"
                className="rounded-lg bg-amber-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={backfill.isPending || backfillPhrase !== CONFIRM_BACKFILL}
                onClick={() => backfill.mutate()}
              >
                Run backfill
              </button>
            </div>
            {bfErr ? <p className="mt-2 text-sm text-red-600">{bfErr}</p> : null}
            {lastBackfill ? (
              <pre className="mt-3 max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">{JSON.stringify(lastBackfill, null, 2)}</pre>
            ) : null}
          </AdminPanel>

          <AdminPanel>
            <h2 className="text-sm font-semibold text-gray-900">Initialize all providers</h2>
            <p className="mt-1 text-sm text-gray-600">
              Initializes provider point rows and runs the full backfill pipeline. Heavier than backfill alone. Type{" "}
              <code className="rounded bg-gray-100 px-1">{CONFIRM_INIT}</code> to enable.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input
                className="w-64 rounded border border-gray-300 px-2 py-1 font-mono text-sm"
                value={initPhrase}
                onChange={(e) => setInitPhrase(e.target.value)}
                placeholder={CONFIRM_INIT}
                autoComplete="off"
              />
              <button
                type="button"
                className="rounded-lg bg-red-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={initialize.isPending || initPhrase !== CONFIRM_INIT}
                onClick={() => initialize.mutate()}
              >
                Run initialize
              </button>
            </div>
            {initErr ? <p className="mt-2 text-sm text-red-600">{initErr}</p> : null}
            {lastInit ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">{JSON.stringify(lastInit, null, 2)}</pre>
            ) : null}
          </AdminPanel>
        </>
      )}
    </div>
  );
}
