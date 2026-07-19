# Agent Workforce Threat Model (STRIDE)

Generated as part of Phase 1 discovery. Review on each major agent release.

## Assets
- Tenant business data (bookings, payouts, support, fraud, reconciliation)
- `agent_actions` approval records and execution leases
- Admin credentials and section RBAC
- Payment/ledger state
- Customer PII in support content

## Trust boundaries
1. **Model boundary** — model output is untrusted; never grants capability.
2. **Tool boundary** — typed tools with schema validation; no generic SQL/HTTP/shell.
3. **Service boundary** — service-role only in private server modules after app-level authz.
4. **Human approval boundary** — `agent_actions` is authoritative; workflow hooks are transport only.

## STRIDE summary

| Threat | Mitigation |
|--------|------------|
| Spoofing (forged agent/principal) | AgentPrincipal minted server-side; capability tokens cross boundaries only; grants reloaded from Postgres |
| Tampering (payload changed after approval) | Canonical payload hash; approved_payload_hash checked at lease acquisition |
| Repudiation | agent_runs, agent_steps, agent_action_approvals, audit_logs |
| Information disclosure | Field allowlists, PII redaction, tenant-scoped views, no bulk export in Copilot |
| Denial of service | Rate limits, cost caps, max tool calls, query limits |
| Elevation of privilege | Effective authz intersection; no superadmin agents; tool grants; shadow mode |

## Prompt injection
Support tickets, provider bios, reviews, uploads, email — labeled untrusted; tool args validated independently; no financial action from user text alone; CI injection corpus.

## P0 launch blockers (mutation)
- Gift card RLS hardening (787)
- Message attachment storage isolation (788)
- Cross-tenant RLS harness green

Mutations remain disabled until `assertAgentMutationAllowed()` passes (see `apps/web/src/lib/agents/safety-gate.ts`).
