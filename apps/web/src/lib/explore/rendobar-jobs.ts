import { exploreWebhookBaseUrl, loadRendobarSecrets } from "@/lib/explore/rendobar-config";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

const RENDOBAR_API = "https://api.rendobar.com";
const FFMPEG_INPUT_STEM = "source";

/** Quote argv tokens for Rendobar `params.command` (no shell; spaces in filters need quoting). */
export function ffmpegCommandString(argv: string[]): string {
  const parts = argv.map((arg) => {
    if (!/[\s'"]/.test(arg)) return arg;
    return `'${arg.replace(/'/g, `'\\''`)}'`;
  });
  return `ffmpeg ${parts.join(" ")}`;
}

export async function createRendobarJob(body: Record<string, unknown>): Promise<{ id: string } | null> {
  const { apiKey } = await loadRendobarSecrets();
  if (!apiKey) return null;

  const res = await fetch(`${RENDOBAR_API}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[rendobar] create job failed", res.status, text);
    return null;
  }

  const json = (await res.json()) as {
    data?: { id?: string; status?: string };
    id?: string;
  };
  const id = json.data?.id ?? json.id;
  return id ? { id } : null;
}

export function buildProbeJob(params: {
  postId: string;
  slideIndex: number;
  publicObjectUrl: string;
}): Record<string, unknown> {
  const callbackUrl = `${exploreWebhookBaseUrl()}?postId=${encodeURIComponent(params.postId)}&slideIndex=${params.slideIndex}&phase=probe`;
  return {
    type: "ffprobe",
    params: {
      // Rendobar ffprobe: bare HTTPS URL or full ffprobe command string.
      command: params.publicObjectUrl,
    },
    callback: {
      url: callbackUrl,
      verify: true,
    },
    idempotencyKey: `explore-probe-${params.postId}-${params.slideIndex}`,
  };
}

const SCALE_VF =
  "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(iw,ih),-2,min(1080,ih))'";

export function buildEncodeJob(params: {
  postId: string;
  slideIndex: number;
  storageConnectionId: string;
  objectPath: string;
  videoFilter?: string | null;
  posterSeekSec?: number;
  /** Input seek (user trim start). */
  trimStartSec?: number | null;
  /** Output `-t` segment length (user window or auto-trim cap). */
  maxOutputDurationSec?: number | null;
}): Record<string, unknown> {
  const outputPrefix = params.objectPath.replace(/\/[^/]+$/, `/rendobar-${Date.now()}-slide${params.slideIndex}`);
  const callbackUrl = `${exploreWebhookBaseUrl()}?postId=${encodeURIComponent(params.postId)}&slideIndex=${params.slideIndex}&phase=encode`;
  const storageInput = `storage://${params.storageConnectionId}/${params.objectPath.replace(/^\//, "")}`;
  const destination = `storage://${params.storageConnectionId}/${outputPrefix.replace(/^\//, "")}`;
  const vf = params.videoFilter?.trim() || SCALE_VF;
  const posterSs = params.posterSeekSec ?? 0.5;
  const trimStartSec =
    params.trimStartSec != null &&
    Number.isFinite(params.trimStartSec) &&
    params.trimStartSec > 0
      ? params.trimStartSec
      : null;
  const trimSec =
    params.maxOutputDurationSec != null &&
    Number.isFinite(params.maxOutputDurationSec) &&
    params.maxOutputDurationSec > 0
      ? params.maxOutputDurationSec
      : null;

  const argv: string[] = [];
  if (trimStartSec != null) {
    argv.push("-ss", String(trimStartSec));
  }
  argv.push("-i", FFMPEG_INPUT_STEM);
  if (trimSec != null) {
    argv.push("-t", String(trimSec));
  }
  argv.push(
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "playback.mp4",
    "-map",
    "0:v:0",
    "-ss",
    String((trimStartSec ?? 0) + posterSs),
    "-frames:v",
    "1",
    "-vf",
    vf,
    "-q:v",
    "2",
    "poster.jpg",
  );

  return {
    type: "ffmpeg",
    inputs: {
      [FFMPEG_INPUT_STEM]: storageInput,
    },
    params: {
      command: ffmpegCommandString(argv),
    },
    destinations: [destination],
    callback: {
      url: callbackUrl,
      verify: true,
    },
    metadata: {
      outputPrefix,
    },
    idempotencyKey: `explore-encode-${params.postId}-${params.slideIndex}-${outputPrefix.replace(/\//g, "_")}`,
  };
}

export function publicUrlForExploreObject(objectPath: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return toPublicMediaUrl(objectPath.replace(/^\//, ""), url);
}

/** Extract command argv from a built encode job (tests). */
export function encodeJobCommandForTests(job: Record<string, unknown>): string {
  const params = job.params as { command?: string } | undefined;
  return params?.command ?? "";
}
