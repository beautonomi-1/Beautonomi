/** Normalize Rendobar webhook / per-job callback envelope (v1) and legacy shapes. */
export function parseRendobarCallbackBody(body: Record<string, unknown>): {
  event: string;
  jobId: string | undefined;
  output: Record<string, unknown> | undefined;
  deliveries: unknown;
} {
  const event = String(body.event ?? "");
  const data = (body.data ?? null) as Record<string, unknown> | null;
  const legacyJob = body.job as Record<string, unknown> | undefined;

  const jobId =
    (data?.jobId as string | undefined) ??
    (legacyJob?.id as string | undefined) ??
    (body.job_id as string | undefined);

  const output =
    (data?.output as Record<string, unknown> | undefined) ??
    (legacyJob?.output as Record<string, unknown> | undefined);

  const deliveries = data?.deliveries ?? body.deliveries;

  return { event, jobId, output, deliveries };
}

function deliveryOk(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "succeeded" || s === "success" || s === "complete";
}

/** Storage delivery row → explore `playback_path` (relative object key). */
export function playbackPathFromRendobarDeliveries(deliveries: unknown): string | null {
  if (!Array.isArray(deliveries)) return null;
  for (const d of deliveries) {
    const row = d as { path?: string; status?: string };
    if (row.path?.includes("playback.mp4") && deliveryOk(row.status)) {
      return row.path.replace(/^\//, "");
    }
    if (row.path?.endsWith(".mp4") && deliveryOk(row.status)) {
      return row.path.replace(/^\//, "");
    }
  }
  return null;
}

/** Job `output.files` / headline file when storage callback order differs. */
export function playbackPathFromRendobarOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output) return null;
  const files = output.files as { path?: string }[] | undefined;
  const fromFiles = files?.find(
    (f) => f.path === "playback.mp4" || f.path?.endsWith("/playback.mp4") || f.path?.endsWith("playback.mp4"),
  );
  if (fromFiles?.path) return fromFiles.path.replace(/^\//, "");
  const file = output.file as { path?: string } | undefined;
  if (file?.path?.endsWith(".mp4")) return file.path.replace(/^\//, "");
  return null;
}
