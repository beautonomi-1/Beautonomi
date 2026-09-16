export type AgentActionRow = {
  id: string;
  agent_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  status: string;
  risk_level: number;
  reasoning_summary: string | null;
  proposed_payload: Record<string, unknown>;
  approval_expires_at: string | null;
  proposed_at: string | null;
  approved_at: string | null;
  executed_at: string | null;
  last_execution_error: string | null;
  created_at: string;
  updated_at?: string;
  payload_hash?: string;
};

export const PENDING_AGENT_STATUSES = new Set(["proposed", "approval_pending"]);
export const ACTIONABLE_AGENT_STATUSES = new Set(["proposed", "approval_pending", "approved"]);
