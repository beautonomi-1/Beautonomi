import fs from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../apps/web/src/app/api/admin/support-tickets/route.ts", import.meta.url));
let s = fs.readFileSync(file, "utf8");

s = s.replace(
  /import \{\n  applySupportAgentTicketScope,\n  getSupportAgentTenantIds,\n  isSupportAgentRole,\n\}/,
  "import { applySupportAgentTicketScope }",
);

const start = s.indexOf("async function loadSupportTicketCounts");
const end = s.indexOf("export async function POST", start);
if (start < 0 || end < 0) {
  throw new Error("Could not locate loadSupportTicketCounts block");
}

const neu = `async function loadSupportTicketCounts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentQueue: boolean,
  scope: { role: string | null | undefined; userId: string },
) {
  const nowIso = new Date().toISOString();
  const openStatuses = ["open", "in_progress", "waiting_customer"];

  const runCount = async (
    build: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
  ) => {
    let query = supabase.from("support_tickets").select("id", { count: "exact", head: true });
    query = build(query);
    query = await applySupportAgentTicketScope(supabase, query, {
      role: scope.role,
      userId: scope.userId,
    });
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  const open = await runCount((q) => q.in("status", openStatuses));
  const unassigned = await runCount((q) => q.in("status", openStatuses).is("assigned_to", null));
  const breachingSla = await runCount((q) =>
    q.lt("sla_resolution_due_at", nowIso).in("status", openStatuses),
  );

  let awaitingReply = 0;
  if (agentQueue) {
    try {
      awaitingReply = await runCount((q) => q.eq("needs_agent_response", true));
    } catch (err) {
      if ((err as { code?: string }).code === "42703") {
        awaitingReply = await runCount((q) => q.eq("status", "open"));
      } else {
        throw err;
      }
    }
  } else {
    awaitingReply = await runCount((q) => q.eq("status", "open"));
  }

  return {
    open,
    unassigned,
    breaching_sla: breachingSla,
    awaiting_reply: awaitingReply,
  };
}

`;

if (s.includes("scope: { role: string | null | undefined; userId: string }")) {
  console.log("Already patched");
  process.exit(0);
}

s = s.slice(0, start) + neu + s.slice(end);
fs.writeFileSync(file, s);
console.log("Patched", file);
