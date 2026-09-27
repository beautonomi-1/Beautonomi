import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_ADMIN_ROLES } from "@beautonomi/admin-access";
import { writeGrcActivity } from "@/lib/grc/activity";
import { GRC_EVIDENCE_BUCKET, evidenceObjectPath, sha256Hex } from "@/lib/grc/evidence";

export type CollectorStatus = "pass" | "warn" | "fail" | "skipped";

export type CollectorResult = {
  status: CollectorStatus;
  summary: Record<string, unknown>;
  details?: unknown;
  /** Short explanation shown on the control and in failure findings. */
  message: string;
};

export type GrcCollector = {
  /** Matches grc_controls.collector_key (from @beautonomi/grc-catalog). */
  key: string;
  title: string;
  schedule: "daily" | "weekly";
  run: (admin: SupabaseClient) => Promise<CollectorResult>;
};

const DAY = 86_400_000;

async function rows<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

type AdminUser = { id: string; email: string | null; role: string; deactivated_at: string | null };

async function activeAdmins(admin: SupabaseClient): Promise<AdminUser[]> {
  const users = await rows<AdminUser>(admin.from("users").select("id, email, role, deactivated_at").in("role", ALL_ADMIN_ROLES));
  return users.filter((u) => !u.deactivated_at);
}

async function lastSignIns(admin: SupabaseClient): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) out.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 1000) break;
  }
  return out;
}

function github(): { token: string; repo: string } | null {
  const token = process.env.GRC_GITHUB_TOKEN;
  const repo = process.env.GRC_GITHUB_REPOSITORY;
  return token && repo ? { token, repo } : null;
}

async function gh<T>(path: string, cfg: { token: string; repo: string }): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  const body = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
  return { status: res.status, body };
}

const skippedNoGithub = (): CollectorResult => ({
  status: "skipped",
  summary: { reason: "GRC_GITHUB_TOKEN / GRC_GITHUB_REPOSITORY not configured" },
  message: "GitHub is not connected, so this was not checked.",
});

const SECRETISH = /secret|token|password|api[_-]?key|private/i;
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRETISH.test(k) ? "[redacted]" : redactSecrets(v)]));
  }
  return value;
}

export const GRC_COLLECTORS: GrcCollector[] = [
  {
    key: "admin-mfa-coverage",
    title: "Admin MFA coverage",
    schedule: "daily",
    run: async (admin) => {
      const admins = await activeAdmins(admin);
      const missing: { id: string; email: string | null; role: string }[] = [];
      for (const u of admins) {
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: u.id });
        if (error) throw new Error(`listFactors(${u.id}): ${error.message}`);
        const verified = (data?.factors ?? []).some((f) => f.status === "verified");
        if (!verified) missing.push({ id: u.id, email: u.email, role: u.role });
      }
      const covered = admins.length - missing.length;
      return {
        status: missing.length === 0 ? "pass" : "fail",
        summary: { admin_users: admins.length, with_verified_mfa: covered, without_mfa: missing.length },
        details: { without_mfa: missing },
        message: missing.length === 0 ? `All ${admins.length} active admins have verified MFA.` : `${missing.length} of ${admins.length} active admins have no verified MFA factor.`,
      };
    },
  },
  {
    key: "admin-access-inventory",
    title: "Admin access inventory",
    schedule: "weekly",
    run: async (admin) => {
      const [admins, signIns] = await Promise.all([activeAdmins(admin), lastSignIns(admin)]);
      const now = Date.now();
      const inventory = admins.map((u) => {
        const last = signIns.get(u.id) ?? null;
        return { id: u.id, email: u.email, role: u.role, last_sign_in_at: last, dormant: !last || now - new Date(last).getTime() > 90 * DAY };
      });
      const byRole: Record<string, number> = {};
      for (const u of inventory) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
      const dormant = inventory.filter((u) => u.dormant);
      return {
        status: dormant.length ? "warn" : "pass",
        summary: { admin_users: inventory.length, by_role: byRole, dormant_90d: dormant.length },
        details: { inventory },
        message: dormant.length ? `${dormant.length} admin accounts have not signed in for 90+ days; review whether they still need access.` : "No dormant admin accounts.",
      };
    },
  },
  {
    key: "grc-role-inventory",
    title: "GRC role inventory",
    schedule: "weekly",
    run: async (admin) => {
      const assignments = await rows<{ user_id: string; grc_role: string; expires_at: string | null; assigned_by: string | null; created_at: string }>(
        admin.from("grc_role_assignments").select("user_id, grc_role, expires_at, assigned_by, created_at").eq("is_active", true),
      );
      const now = Date.now();
      const expiredButActive = assignments.filter((a) => a.expires_at && new Date(a.expires_at).getTime() <= now);
      const rolesByUser = new Map<string, Set<string>>();
      for (const a of assignments) rolesByUser.set(a.user_id, (rolesByUser.get(a.user_id) ?? new Set()).add(a.grc_role));
      const toxic = [...rolesByUser.entries()].filter(([, r]) => r.has("risk_manager") && r.has("management_approver")).map(([user_id]) => user_id);
      const admins = assignments.filter((a) => a.grc_role === "grc_admin").length;
      const issues = [
        expiredButActive.length && `${expiredButActive.length} expired assignments still marked active`,
        toxic.length && `${toxic.length} people hold both risk manager and management approver`,
        admins === 0 && "no GRC admin assigned",
      ].filter(Boolean);
      return {
        status: issues.length ? "warn" : "pass",
        summary: { active_assignments: assignments.length, people: rolesByUser.size, grc_admins: admins, expired_but_active: expiredButActive.length, conflicting_role_holders: toxic.length },
        details: { assignments, conflicting_role_holders: toxic },
        message: issues.length ? `Review needed: ${issues.join("; ")}.` : "GRC roles are assigned without conflicts.",
      };
    },
  },
  {
    key: "grc-activity-chain",
    title: "GRC activity log integrity",
    schedule: "daily",
    run: async (admin) => {
      const { data, error } = await admin.rpc("grc_verify_activity_chain").maybeSingle();
      if (error) throw new Error(error.message);
      const r = data as { rows_checked: number; first_broken_id: number | null; last_hash: string | null };
      return {
        status: r.first_broken_id === null ? "pass" : "fail",
        summary: { rows_checked: Number(r.rows_checked), first_broken_id: r.first_broken_id, last_hash: r.last_hash },
        message: r.first_broken_id === null ? `Hash chain verified across ${r.rows_checked} entries.` : `Hash chain broken at entry ${r.first_broken_id}. Treat as a security incident.`,
      };
    },
  },
  {
    key: "platform-security-settings",
    title: "Platform security settings",
    schedule: "daily",
    run: async (admin) => {
      const { data, error } = await admin.from("platform_settings").select("settings, updated_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      const security = ((data as { settings?: Record<string, unknown> } | null)?.settings?.security ?? {}) as Record<string, unknown>;
      const twoFactor = (security.two_factor ?? {}) as { enabled?: boolean; required_for_admins?: boolean };
      const mfaEnforced = twoFactor.enabled === true && twoFactor.required_for_admins !== false;
      return {
        status: mfaEnforced ? "pass" : "fail",
        summary: { admin_mfa_enforced: mfaEnforced, admin_session_max_age: security.admin_session_max_age ?? null, ip_allowlist_entries: Array.isArray(security.admin_ip_allowlist) ? security.admin_ip_allowlist.length : 0 },
        details: { security: redactSecrets(security), settings_updated_at: (data as { updated_at?: string } | null)?.updated_at ?? null },
        message: mfaEnforced ? "Admin MFA is enforced in platform settings." : "Admin MFA is not enforced in platform settings.",
      };
    },
  },
  {
    key: "admin-audit-activity",
    title: "Admin audit log activity",
    schedule: "daily",
    run: async (admin) => {
      const since = new Date(Date.now() - DAY).toISOString();
      const recent = await rows<{ action: string }>(admin.from("audit_logs").select("action").gte("created_at", since).limit(10_000));
      const { count: total, error } = await admin.from("audit_logs").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      const byAction: Record<string, number> = {};
      for (const r of recent) byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      const top = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 25);
      return {
        status: "pass",
        summary: { events_last_24h: recent.length, total_events: total ?? 0 },
        details: { top_actions_last_24h: Object.fromEntries(top) },
        message: `Audit logging active: ${recent.length} admin events in the last 24 hours.`,
      };
    },
  },
  {
    key: "data-retention-purges",
    title: "Data retention and purge record",
    schedule: "weekly",
    run: async (admin) => {
      const since = new Date(Date.now() - 35 * DAY).toISOString();
      const purges = await rows<{ id: string; created_at: string; purge_type: string; actor_user_id: string | null }>(
        admin.from("compliance_purge_audit_log").select("id, created_at, purge_type, actor_user_id").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      );
      return {
        status: "pass",
        summary: { purges_last_35d: purges.length },
        details: { purges },
        message: purges.length ? `${purges.length} regulated purges recorded in the last 35 days.` : "No regulated purges in the last 35 days (none requested, or check the purge job).",
      };
    },
  },
  {
    key: "branch-protection",
    title: "Default branch protection",
    schedule: "weekly",
    run: async () => {
      const cfg = github();
      if (!cfg) return skippedNoGithub();
      const repo = await gh<{ default_branch: string }>("", cfg);
      if (repo.status !== 200 || !repo.body) throw new Error(`GitHub repo lookup failed (${repo.status})`);
      const branch = repo.body.default_branch;
      const rules = await gh<Array<{ type: string; parameters?: Record<string, unknown> }>>(`/rules/branches/${encodeURIComponent(branch)}`, cfg);
      const protection = await gh<{
        required_pull_request_reviews?: { required_approving_review_count?: number; dismiss_stale_reviews?: boolean };
        required_status_checks?: { contexts?: string[]; checks?: unknown[] };
        allow_force_pushes?: { enabled?: boolean };
        allow_deletions?: { enabled?: boolean };
        enforce_admins?: { enabled?: boolean };
      }>(`/branches/${encodeURIComponent(branch)}/protection`, cfg);

      const ruleTypes = new Set((rules.body ?? []).map((r) => r.type));
      const prRule = (rules.body ?? []).find((r) => r.type === "pull_request");
      const p = protection.status === 200 ? protection.body : null;
      const approvals = Math.max(Number(prRule?.parameters?.required_approving_review_count ?? 0), p?.required_pull_request_reviews?.required_approving_review_count ?? 0);
      const requiresPr = ruleTypes.has("pull_request") || !!p?.required_pull_request_reviews;
      const statusChecks = ruleTypes.has("required_status_checks") || !!p?.required_status_checks;
      const forcePushBlocked = ruleTypes.has("non_fast_forward") || p?.allow_force_pushes?.enabled === false;
      const deletionBlocked = ruleTypes.has("deletion") || p?.allow_deletions?.enabled === false;
      const pass = requiresPr && approvals >= 1 && statusChecks && forcePushBlocked;
      return {
        status: pass ? "pass" : "fail",
        summary: { branch, requires_pull_request: requiresPr, required_approvals: approvals, required_status_checks: statusChecks, force_push_blocked: forcePushBlocked, deletion_blocked: deletionBlocked, enforce_admins: p?.enforce_admins?.enabled ?? null },
        details: { rulesets: rules.body, classic_protection: p, classic_protection_status: protection.status },
        message: pass ? `${branch} requires reviewed PRs and passing checks; force pushes are blocked.` : `${branch} is missing required protections (PR review, status checks or force-push block).`,
      };
    },
  },
  {
    key: "ci-security-gates",
    title: "CI security gates",
    schedule: "daily",
    run: async () => {
      const cfg = github();
      if (!cfg) return skippedNoGithub();
      const repo = await gh<{ default_branch: string }>("", cfg);
      if (repo.status !== 200 || !repo.body) throw new Error(`GitHub repo lookup failed (${repo.status})`);
      const branch = repo.body.default_branch;
      const runs = await gh<{ workflow_runs: Array<{ id: number; name: string; workflow_id: number; conclusion: string | null; status: string; head_sha: string; created_at: string; html_url: string }> }>(
        `/actions/runs?branch=${encodeURIComponent(branch)}&per_page=100&exclude_pull_requests=true`,
        cfg,
      );
      if (runs.status !== 200 || !runs.body) throw new Error(`GitHub runs lookup failed (${runs.status})`);
      const latest = new Map<number, (typeof runs.body.workflow_runs)[number]>();
      for (const r of runs.body.workflow_runs) if (r.status === "completed" && !latest.has(r.workflow_id)) latest.set(r.workflow_id, r);
      const workflows = [...latest.values()].map((r) => ({ name: r.name, conclusion: r.conclusion, head_sha: r.head_sha, created_at: r.created_at, url: r.html_url }));
      const failing = workflows.filter((w) => w.conclusion === "failure");
      return {
        status: workflows.length === 0 ? "warn" : failing.length ? "fail" : "pass",
        summary: { branch, workflows: workflows.length, failing: failing.length },
        details: { latest_runs: workflows },
        message: workflows.length === 0 ? `No completed workflow runs found on ${branch}.` : failing.length ? `${failing.length} workflows are failing on ${branch}: ${failing.map((f) => f.name).join(", ")}.` : `All ${workflows.length} workflows pass on ${branch}.`,
      };
    },
  },
  {
    key: "dependabot-alerts",
    title: "Dependency vulnerability alerts",
    schedule: "daily",
    run: async (admin) => {
      const cfg = github();
      if (!cfg) return skippedNoGithub();
      type Alert = { number: number; state: string; html_url: string; created_at: string; dismissed_reason?: string | null; security_advisory?: { summary?: string; severity?: string; ghsa_id?: string }; security_vulnerability?: { severity?: string; package?: { name?: string; ecosystem?: string } } };
      const open: Alert[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await gh<Alert[]>(`/dependabot/alerts?state=open&per_page=100&page=${page}`, cfg);
        if (res.status !== 200 || !res.body) throw new Error(`Dependabot alerts lookup failed (${res.status})`);
        open.push(...res.body);
        if (res.body.length < 100) break;
      }

      const sev = (a: Alert) => {
        const s = (a.security_vulnerability?.severity ?? a.security_advisory?.severity ?? "medium").toLowerCase();
        return ["critical", "high", "medium", "low"].includes(s) ? s : "medium";
      };
      const existing = await rows<{ id: string; external_ref: string; status: string }>(admin.from("grc_findings").select("id, external_ref, status").eq("source", "dependabot"));
      const byRef = new Map(existing.map((f) => [f.external_ref, f]));
      const openRefs = new Set(open.map((a) => `dependabot:${a.number}`));

      const fresh = open.filter((a) => !byRef.has(`dependabot:${a.number}`)).map((a) => ({
        title: `${a.security_vulnerability?.package?.name ?? "dependency"}: ${a.security_advisory?.summary ?? `Dependabot alert #${a.number}`}`.slice(0, 300),
        source: "dependabot",
        external_ref: `dependabot:${a.number}`,
        severity: sev(a),
        status: "open",
        description: `${a.security_advisory?.ghsa_id ?? ""} ${a.html_url}`.trim(),
      }));
      if (fresh.length) {
        const { error } = await admin.from("grc_findings").insert(fresh);
        if (error) throw new Error(error.message);
      }

      let resolved = 0;
      for (const f of existing.filter((x) => x.status !== "closed" && x.status !== "risk_accepted" && !openRefs.has(x.external_ref))) {
        const n = f.external_ref.replace("dependabot:", "");
        const res = await gh<Alert>(`/dependabot/alerts/${n}`, cfg);
        if (res.status !== 200 || !res.body || res.body.state === "open") continue;
        const fixed = res.body.state === "fixed" || res.body.state === "auto_dismissed";
        const { error } = await admin
          .from("grc_findings")
          .update({
            status: fixed ? "closed" : "risk_accepted",
            closed_at: new Date().toISOString(),
            closure_notes: fixed ? `GitHub reports the alert as ${res.body.state}.` : `Dismissed in GitHub (${res.body.dismissed_reason ?? "no reason given"}).`,
          })
          .eq("id", f.id);
        if (error) continue;
        resolved++;
        await writeGrcActivity({
          actor_label: "grc-tick",
          action: fixed ? "grc.finding.closed" : "grc.finding.risk_accepted",
          entity_type: "grc_finding",
          entity_id: f.id,
          metadata: { source: "dependabot", alert: Number(n), github_state: res.body.state },
        });
      }

      const bySeverity: Record<string, number> = {};
      for (const a of open) bySeverity[sev(a)] = (bySeverity[sev(a)] ?? 0) + 1;
      const serious = (bySeverity.critical ?? 0) + (bySeverity.high ?? 0);
      return {
        status: serious ? "warn" : "pass",
        summary: { open_alerts: open.length, by_severity: bySeverity, findings_created: fresh.length, findings_resolved: resolved },
        details: { open: open.map((a) => ({ number: a.number, severity: sev(a), package: a.security_vulnerability?.package, advisory: a.security_advisory?.ghsa_id, created_at: a.created_at })) },
        message: serious ? `${serious} critical/high dependency alerts are open (tracked as findings).` : `${open.length} open dependency alerts, none critical or high.`,
      };
    },
  },
];

export function collectorIsDue(c: GrcCollector, now: Date): boolean {
  return c.schedule === "daily" || now.getUTCDay() === 1;
}

async function recordEvidence(admin: SupabaseClient, c: GrcCollector, result: CollectorResult, now: Date): Promise<{ controls: string[]; sha256: string }> {
  const artifact = {
    collector: c.key,
    title: c.title,
    collected_at: now.toISOString(),
    status: result.status,
    message: result.message,
    summary: result.summary,
    details: result.details ?? null,
  };
  const json = JSON.stringify(artifact, null, 2);
  const bytes = Buffer.from(json, "utf8");
  const sha = sha256Hex(bytes);
  const path = evidenceObjectPath(`collector_${c.key}`, sha);

  const { error: upErr } = await admin.storage.from(GRC_EVIDENCE_BUCKET).upload(path, bytes, { contentType: "application/json", upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(`upload: ${upErr.message}`);

  const controls = await rows<{ id: string }>(admin.from("grc_controls").select("id").eq("collector_key", c.key).neq("status", "not_applicable"));
  if (controls.length) {
    const day = now.toISOString().slice(0, 10);
    const { error } = await admin.from("grc_evidence").insert(
      controls.map((ctl) => ({
        control_id: ctl.id,
        storage_path: path,
        content_sha256: sha,
        status: "submitted",
        source: "collector",
        submitted_by: null,
        title: `${c.title} — ${result.status.toUpperCase()} (${day})`,
        file_name: `${c.key}-${day}.json`,
        mime_type: "application/json",
        size_bytes: bytes.byteLength,
        period_start: day,
        period_end: day,
        metadata: { collector: c.key, status: result.status, message: result.message, summary: result.summary },
      })),
    );
    if (error) throw new Error(`evidence insert: ${error.message}`);
  }
  return { controls: controls.map((x) => x.id), sha256: sha };
}

/** A failing check opens one finding per collector until someone closes it. */
async function raiseFailureFinding(admin: SupabaseClient, c: GrcCollector, result: CollectorResult, controlIds: string[], now: Date) {
  const { data: open } = await admin.from("grc_findings").select("id").eq("source", "self_identified").like("external_ref", `collector:${c.key}:%`).neq("status", "closed").limit(1);
  if (open?.length) return;
  await admin.from("grc_findings").insert({
    title: `Automated check failed: ${c.title}`,
    severity: c.key === "grc-activity-chain" || c.key === "admin-mfa-coverage" ? "high" : "medium",
    status: "open",
    source: "self_identified",
    external_ref: `collector:${c.key}:${now.toISOString().slice(0, 10)}`,
    control_id: controlIds[0] ?? null,
    description: result.message,
  });
}

export type CollectorRun = { key: string; status: CollectorStatus | "error"; message: string; controls?: string[] };

export async function runDueCollectors(admin: SupabaseClient, now = new Date(), only?: string[]): Promise<CollectorRun[]> {
  const out: CollectorRun[] = [];
  for (const c of GRC_COLLECTORS) {
    if (only ? !only.includes(c.key) : !collectorIsDue(c, now)) continue;
    try {
      const result = await c.run(admin);
      if (result.status === "skipped") {
        out.push({ key: c.key, status: "skipped", message: result.message });
        continue;
      }
      const { controls } = await recordEvidence(admin, c, result, now);
      if (result.status === "fail") await raiseFailureFinding(admin, c, result, controls, now);
      out.push({ key: c.key, status: result.status, message: result.message, controls });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.push({ key: c.key, status: "error", message });
      Sentry.captureException(e, { tags: { grc_collector: c.key } });
      await writeGrcActivity({ actor_label: "grc-tick", action: "grc.collector.failed", entity_type: "grc_collector", entity_id: c.key, metadata: { error: message.slice(0, 500) } });
    }
  }
  return out;
}
