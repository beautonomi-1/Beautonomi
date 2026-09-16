import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { adminToast } from "@/lib/adminToast";

function invalidateAgentActionQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "agent-actions"] });
  void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "agent-actions-queue"] });
  void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "agent-action"] });
}

export function useAgentActionMutations(opts?: { onSuccess?: () => void }) {
  const qc = useQueryClient();

  const approve = useMutation({
    mutationFn: async (params: { id: string; payloadOverride?: Record<string, unknown>; comments?: string }) => {
      const body: Record<string, unknown> = {};
      if (params.payloadOverride) body.payload_override = params.payloadOverride;
      if (params.comments) body.comments = params.comments;
      return adminApi.postJson<{ ok?: boolean; status?: string; required_approvals?: number }>(
        `/api/admin/agent-actions/${encodeURIComponent(params.id)}/approve`,
        body,
      );
    },
    onSuccess: (res) => {
      adminToast.success(
        res.status === "approved" ? "Approved and ready to send" : "Approval recorded — another reviewer may be required",
      );
      invalidateAdminShellCounts(qc);
      invalidateAgentActionQueries(qc);
      opts?.onSuccess?.();
    },
    onError: (e: Error) => adminToast.error(`Could not approve: ${e.message}`),
  });

  const reject = useMutation({
    mutationFn: async (params: { id: string; comments?: string }) => {
      const body = params.comments ? { comments: params.comments } : {};
      return adminApi.postJson(`/api/admin/agent-actions/${encodeURIComponent(params.id)}/reject`, body);
    },
    onSuccess: () => {
      adminToast.success("Proposal rejected");
      invalidateAdminShellCounts(qc);
      invalidateAgentActionQueries(qc);
      opts?.onSuccess?.();
    },
    onError: (e: Error) => adminToast.error(`Could not reject: ${e.message}`),
  });

  const execute = useMutation({
    mutationFn: async (params: { id: string; expectedPayloadHash?: string }) => {
      const body: Record<string, unknown> = {};
      if (params.expectedPayloadHash) body.expected_payload_hash = params.expectedPayloadHash;
      return adminApi.postJson<{ executed?: boolean; reason?: string; gate?: string[] }>(
        `/api/admin/agent-actions/${encodeURIComponent(params.id)}/execute`,
        body,
      );
    },
    onSuccess: (res) => {
      if (res.executed) {
        adminToast.success("Action applied");
      } else if (res.gate?.length) {
        adminToast.warning("Preview only. Approved replies will not send until the platform enables sending.");
      } else {
        adminToast.error(res.reason ?? "Execution blocked");
      }
      invalidateAdminShellCounts(qc);
      invalidateAgentActionQueries(qc);
      opts?.onSuccess?.();
    },
    onError: (e: Error) => adminToast.error(`Could not apply: ${e.message}`),
  });

  const busy = approve.isPending || reject.isPending || execute.isPending;

  return { approve, reject, execute, busy };
}
