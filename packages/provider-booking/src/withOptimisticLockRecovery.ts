export type OptimisticLockConflict = {
  isConflict: boolean;
  status?: number;
  code?: string | null;
  message?: string | null;
};

export function detectOptimisticLockConflict(err: unknown): OptimisticLockConflict {
  if (!err || typeof err !== "object") {
    return { isConflict: false };
  }
  const e = err as { status?: number; code?: string; message?: string; errorCode?: string };
  const status = e.status;
  const code = e.code ?? e.errorCode ?? null;
  const message = e.message ?? null;
  if (status === 409 || code === "CONFLICT") {
    return { isConflict: true, status, code, message };
  }
  return { isConflict: false, status, code, message };
}
