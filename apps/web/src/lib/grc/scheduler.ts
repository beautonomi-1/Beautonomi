import type { SupabaseClient } from "@supabase/supabase-js";
import { writeGrcActivity } from "@/lib/grc/activity";
import { evidenceDueAt } from "@/lib/grc/cadence";

const DAY = 86_400_000;
const MY_WORK_URL = "/admin/grc/my-work";

async function rows<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function settingInt(admin: SupabaseClient, key: string, fallback: number): Promise<number> {
  const { data } = await admin.from("grc_settings").select("value").eq("key", key).maybeSingle();
  const v = Number((data as { value?: unknown } | null)?.value);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

type Notice = { user_id: string; title: string; message: string; data: Record<string, unknown> };

/**
 * Daily housekeeping. Idempotent: safe to re-run the same day (requests are only raised when none
 * is open; reminders fire on fixed day offsets, so a re-run on the same day can at worst repeat them).
 */
export async function runGrcScheduler(admin: SupabaseClient, now = new Date()) {
  const nowMs = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const isMonday = now.getUTCDay() === 1;
  const leadDays = await settingInt(admin, "evidence_request_lead_days", 14);

  // 1. Expire role assignments whose end date has passed (the DB audit trigger logs each revoke).
  const expired = await rows<{ id: string }>(
    admin.from("grc_role_assignments").select("id").eq("is_active", true).lt("expires_at", now.toISOString()),
  );
  for (const a of expired) {
    await admin.from("grc_role_assignments").update({ is_active: false, revoke_reason: "Expired automatically" }).eq("id", a.id);
  }

  // 2. Lapse risk acceptances past their expiry and send the risk back for re-assessment.
  const lapsed = await rows<{ id: string; risk_id: string }>(
    admin.from("grc_risk_acceptances").select("id, risk_id").eq("status", "approved").lt("expires_at", today),
  );
  for (const acc of lapsed) {
    await admin.from("grc_risks").update({ status: "open", review_due_at: today }).eq("id", acc.risk_id).eq("status", "accepted");
    await admin.from("grc_risk_acceptances").update({ status: "lapsed" }).eq("id", acc.id).eq("status", "approved");
    await writeGrcActivity({ actor_label: "grc-tick", action: "grc.risk_acceptance.lapsed", entity_type: "grc_risk", entity_id: acc.risk_id, metadata: { acceptance_id: acc.id } });
  }

  // 3. Raise evidence requests for controls whose evidence goes stale within the lead time.
  const controls = await rows<{ id: string; title: string; frequency: string | null; last_evidence_at: string | null; owner_user_id: string | null }>(
    admin.from("grc_controls").select("id, title, frequency, last_evidence_at, owner_user_id").in("status", ["implemented", "operating"]),
  );
  const openRequests = await rows<{ control_id: string }>(admin.from("grc_evidence_requests").select("control_id").eq("status", "open"));
  const hasOpen = new Set(openRequests.map((r) => r.control_id));
  const toCreate = controls
    .filter((c) => !hasOpen.has(c.id))
    .map((c) => ({ c, due: evidenceDueAt(c.frequency, c.last_evidence_at, nowMs) }))
    .filter(({ due }) => due.getTime() - nowMs <= leadDays * DAY)
    .map(({ c, due }) => ({
      control_id: c.id,
      title: `${c.last_evidence_at ? "Refresh" : "Provide"} evidence: ${c.title}`.slice(0, 300),
      due_at: new Date(Math.max(due.getTime(), nowMs + 3 * DAY)).toISOString(),
      assignee_user_id: c.owner_user_id,
      status: "open",
    }));
  if (toCreate.length) {
    const { error } = await admin.from("grc_evidence_requests").insert(toCreate);
    if (error) throw new Error(`evidence requests: ${error.message}`);
  }

  // 4. Reminders: 7 and 1 days before due; overdue items weekly on Mondays.
  const notices: Notice[] = [];
  const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - nowMs) / DAY);
  const remindable = (iso: string | null) => {
    if (!iso) return false;
    const d = daysLeft(iso);
    return d === 7 || d === 1 || (d <= 0 && isMonday);
  };

  const requests = await rows<{ id: string; title: string; due_at: string; assignee_user_id: string | null; control_id: string }>(
    admin.from("grc_evidence_requests").select("id, title, due_at, assignee_user_id, control_id").eq("status", "open").not("assignee_user_id", "is", null),
  );
  for (const r of requests.filter((x) => remindable(x.due_at))) {
    const d = daysLeft(r.due_at);
    notices.push({
      user_id: r.assignee_user_id!,
      title: d <= 0 ? "Evidence overdue" : `Evidence due in ${d} day${d === 1 ? "" : "s"}`,
      message: `${r.title} (${r.control_id})`,
      data: { grc: true, kind: "evidence_request", id: r.id, control_id: r.control_id },
    });
  }

  const findings = await rows<{ id: string; title: string; severity: string; due_at: string | null; owner_user_id: string | null }>(
    admin.from("grc_findings").select("id, title, severity, due_at, owner_user_id").in("status", ["open", "in_progress"]).not("owner_user_id", "is", null),
  );
  for (const f of findings.filter((x) => remindable(x.due_at))) {
    const d = daysLeft(f.due_at!);
    notices.push({
      user_id: f.owner_user_id!,
      title: d <= 0 ? `Overdue ${f.severity} finding` : `${f.severity} finding due in ${d} day${d === 1 ? "" : "s"}`,
      message: f.title,
      data: { grc: true, kind: "finding", id: f.id },
    });
  }

  if (isMonday) {
    const docs = await rows<{ id: string; title: string; next_review_at: string | null; owner_user_id: string | null }>(
      admin.from("grc_documents").select("id, title, next_review_at, owner_user_id").eq("status", "approved").not("owner_user_id", "is", null).lte("next_review_at", new Date(nowMs + 30 * DAY).toISOString().slice(0, 10)),
    );
    for (const doc of docs) {
      notices.push({
        user_id: doc.owner_user_id!,
        title: doc.next_review_at && doc.next_review_at < today ? "Policy review overdue" : "Policy review due soon",
        message: `${doc.title} is due for review on ${doc.next_review_at}.`,
        data: { grc: true, kind: "document_review", id: doc.id },
      });
    }
  }

  if (notices.length) {
    const { error } = await admin.from("notifications").insert(notices.map((n) => ({ ...n, type: "system", action_url: MY_WORK_URL })));
    if (error) throw new Error(`notifications: ${error.message}`);
  }

  return {
    assignments_expired: expired.length,
    risk_acceptances_lapsed: lapsed.length,
    evidence_requests_created: toCreate.length,
    reminders_sent: notices.length,
  };
}
