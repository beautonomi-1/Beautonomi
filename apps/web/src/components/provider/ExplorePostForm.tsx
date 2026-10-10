"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  ImageIcon,
  FlipHorizontal,
} from "lucide-react";
import type { ExploreMediaSlideMeta, ExplorePost, ExploreTextOverlay } from "@/types/explore";
import { ExploreTextOverlayLayer } from "@/components/explore/ExploreTextOverlayLayer";
import {
  ExploreVideoTrimModal,
  type ExploreVideoTrimResult,
} from "@/components/explore/ExploreVideoTrimModal";
import { trimWindowDurationMs } from "@/lib/explore/explore-video-trim";
import { firstSlideIsVideo } from "@/lib/explore/video-media";
import { useTranslation } from "@beautonomi/i18n";
import {
  ExploreSoundPicker,
  type ExploreSoundPickerItem,
} from "@/components/explore/ExploreSoundPicker";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const DEFAULT_MULTIPART_IMAGE_BYTES = Math.floor(4.5 * 1024 * 1024);
const DEFAULT_MAX_VIDEO_BYTES = 262_144_000;
const MAX_MEDIA_ITEMS = 5;
const MIN_VIDEO_RECORD_MS = 450;

function LibraryClipRing({
  trimStartMs,
  trimEndMs,
  sourceMs,
  label,
}: {
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  sourceMs?: number | null;
  label: string;
}) {
  const source = sourceMs && sourceMs > 0 ? sourceMs : trimEndMs && trimEndMs > 0 ? trimEndMs : 1;
  const start = Math.min(1, Math.max(0, (trimStartMs ?? 0) / source));
  const end = Math.min(1, Math.max(start, (trimEndMs ?? source) / source));
  const r = 46;
  const c = 2 * Math.PI * r;
  const visible = Math.max(c * (end - start), 4);
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] pointer-events-none -rotate-90"
      aria-label={label}
    >
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeDasharray={`${visible} ${c}`}
        strokeDashoffset={-c * start}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExploreRecordProgressRing({
  size,
  progress,
  recording,
}: {
  size: number;
  progress: number;
  recording: boolean;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = c * (1 - clamped);
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90 pointer-events-none"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={recording ? "#ef4444" : "#ffffff"}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

function isVideoPath(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface ExplorePostFormProps {
  post?: ExplorePost;
  onSuccess: () => void;
  onCancel?: () => void;
  /** Pre-seed from the "post your work" completion flow (booking detail → new post). */
  preseedCaption?: string;
  preseedOfferingId?: string;
  preseedBookingId?: string;
  preseedAddToGallery?: boolean;
}

export function ExplorePostForm({
  post,
  onSuccess,
  onCancel,
  preseedCaption,
  preseedOfferingId,
  preseedBookingId,
  preseedAddToGallery,
}: ExplorePostFormProps) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(post?.caption ?? preseedCaption ?? "");
  const [primaryCategorySlug, setPrimaryCategorySlug] = useState<string | null>(
    post?.primary_category_slug ?? null
  );
  const [offeringId, setOfferingId] = useState<string | null>(
    post?.offering_id ?? preseedOfferingId ?? null
  );
  const [alsoAddToGallery, setAlsoAddToGallery] = useState(
    post ? false : preseedAddToGallery ?? true
  );
  const [categories, setCategories] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [offerings, setOfferings] = useState<{ id: string; title: string }[]>([]);
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [mediaPaths, setMediaPaths] = useState<string[]>(() => {
    if (!post?.media_urls?.length) return [];
    return post.media_urls.map((url) => {
      if (url.startsWith("http")) {
        const m = url.match(/\/explore-posts\/(.+)$/);
        return m ? m[1] : url;
      }
      return url;
    });
  });
  const [mediaMetaSlides, setMediaMetaSlides] = useState<ExploreMediaSlideMeta[]>(
    () => post?.media_meta ?? [],
  );
  const [overlayDraft, setOverlayDraft] = useState("");
  const [uploadCaps, setUploadCaps] = useState({
    maxImage: DEFAULT_MAX_IMAGE_BYTES,
    maxMultipart: DEFAULT_MULTIPART_IMAGE_BYTES,
    maxVideoDurationMs: 60_000,
    maxVideoBytes: DEFAULT_MAX_VIDEO_BYTES,
  });
  const [soundId, setSoundId] = useState<string | null>(post?.sound_id ?? null);
  const [soundCatalogEnabled, setSoundCatalogEnabled] = useState(false);
  const [providerSounds, setProviderSounds] = useState<ExploreSoundPickerItem[]>([]);
  const hasVideoMedia = mediaPaths.some((p) => isVideoPath(p));
  /** Sound bed plays on customer full-screen video (first slide must be video). */
  const hasVideoFirstForSound = firstSlideIsVideo(mediaPaths, mediaMetaSlides);
  const soundPickerLabels = useMemo(
    () => ({
      addMusic: t("web.provider.explorePostForm.addMusic"),
      originalAudio: t("web.provider.explorePostForm.originalAudio"),
      viewerHint: t("web.provider.explorePostForm.soundViewerHint"),
      soundsEmpty: t("web.provider.explorePostForm.soundsEmpty"),
      sectionPlatform: t("web.provider.explorePostForm.soundsSectionPlatform"),
      sectionYours: t("web.provider.explorePostForm.soundsSectionYours"),
      previewPlay: t("web.provider.explorePostForm.soundPreviewPlay"),
      previewStop: t("web.provider.explorePostForm.soundPreviewStop"),
    }),
    [t],
  );

  useEffect(() => {
    void fetcher.get<{
      data?: {
        max_image_bytes?: number;
        max_multipart_image_bytes?: number;
        max_duration_ms?: number;
        max_video_bytes?: number;
        sound_catalog_enabled?: boolean;
      };
    }>("/api/explore/upload").then((res) => {
      const d = (res as {
        data?: {
          max_image_bytes?: number;
          max_multipart_image_bytes?: number;
          max_duration_ms?: number;
          max_video_bytes?: number;
          sound_catalog_enabled?: boolean;
        };
      })?.data;
      setUploadCaps((prev) => ({
        maxImage: d?.max_image_bytes ?? prev.maxImage,
        maxMultipart: d?.max_multipart_image_bytes ?? prev.maxMultipart,
        maxVideoDurationMs: d?.max_duration_ms ?? prev.maxVideoDurationMs,
        maxVideoBytes: d?.max_video_bytes ?? prev.maxVideoBytes,
      }));
      setSoundCatalogEnabled(d?.sound_catalog_enabled === true);
    }).catch(() => {});
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPosted, setIsPosted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [captureMode, setCaptureMode] = useState<"idle" | "camera" | "gallery">("idle");
  const [captureType, setCaptureType] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgressMs, setRecordProgressMs] = useState(0);
  const recordingStartedAtRef = useRef(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [lensReady, setLensReady] = useState(false);
  const [videoInputCount, setVideoInputCount] = useState(0);
  const facingModeRef = useRef<"user" | "environment">("user");
  const frontDeviceIdRef = useRef<string | null>(null);
  const backDeviceIdRef = useRef<string | null>(null);
  const lensRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoTrimPending, setVideoTrimPending] = useState<{
    file: File;
    videoUrl: string;
    durationMs: number;
  } | null>(null);
  const videoTrimQueueRef = useRef<
    { file: File; videoUrl: string; durationMs: number }[]
  >([]);

  const categorySyncedFromPost = useRef(false);
  useEffect(() => {
    fetcher
      .get<{ id: string; slug: string; name: string }[] | { data: { id: string; slug: string; name: string }[] }>("/api/public/categories/global")
      .then((res) => {
        const raw = (res as any)?.data ?? res;
        const list = Array.isArray(raw) ? raw : raw?.data ?? [];
        setCategories(list);
        if (
          post?.primary_category_id &&
          list.length > 0 &&
          !categorySyncedFromPost.current
        ) {
          const cat = list.find((c: { id: string }) => c.id === post.primary_category_id);
          if (cat) {
            setPrimaryCategorySlug(cat.slug);
            categorySyncedFromPost.current = true;
          }
        }
      })
      .catch(() => {});
  }, [post?.primary_category_id]);

  useEffect(() => {
    fetcher
      .get<{ id: string; title: string }[] | { data: { id: string; title: string }[] }>("/api/provider/services")
      .then((res) => {
        const raw = (res as any)?.data ?? res;
        const list = Array.isArray(raw) ? raw : raw?.data ?? [];
        setOfferings(list.map((o: { id: string; title?: string }) => ({ id: o.id, title: o.title ?? "" })));
      })
      .catch(() => setOfferings([]));
  }, []);

  useEffect(() => {
    if (!hasVideoFirstForSound || !soundCatalogEnabled) {
      if (!hasVideoFirstForSound) setSoundId(null);
      return;
    }
    fetcher
      .get<{ data: ExploreSoundPickerItem[] }>("/api/explore/sounds/mine")
      .then((res) => {
        const raw = (res as { data?: { data?: unknown } })?.data?.data ?? (res as { data?: unknown })?.data ?? res;
        const list = Array.isArray(raw) ? raw : [];
        setProviderSounds(list as ExploreSoundPickerItem[]);
      })
      .catch(() => setProviderSounds([]));
  }, [hasVideoFirstForSound, soundCatalogEnabled]);


  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const rememberVideoInputs = useCallback(async (openedId: string | undefined, mode: "user" | "environment") => {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    setVideoInputCount(devices.length);
    const lensOf = (label: string): "user" | "environment" | null => {
      if (/\b(back|rear|environment)\b|facing back/i.test(label)) return "environment";
      if (/\b(front|user|facetime)\b|facing front/i.test(label)) return "user";
      return null;
    };
    const labeledFront = devices.find((d) => lensOf(d.label) === "user");
    const labeledBack = devices.find((d) => lensOf(d.label) === "environment");
    if (labeledFront) frontDeviceIdRef.current = labeledFront.deviceId;
    if (labeledBack) backDeviceIdRef.current = labeledBack.deviceId;
    if (openedId) {
      if (mode === "user" && !frontDeviceIdRef.current) frontDeviceIdRef.current = openedId;
      if (mode === "environment" && !backDeviceIdRef.current) backDeviceIdRef.current = openedId;
      const other = devices.find((d) => d.deviceId !== openedId);
      if (other && devices.length > 1) {
        if (mode === "user" && !backDeviceIdRef.current) backDeviceIdRef.current = other.deviceId;
        if (mode === "environment" && !frontDeviceIdRef.current) frontDeviceIdRef.current = other.deviceId;
      }
    }
  }, []);

  const openLens = useCallback(
    async (mode: "user" | "environment") => {
      const requestId = ++lensRequestRef.current;
      const stillCurrent = () => requestId === lensRequestRef.current;
      const dropStream = (stream: MediaStream) => {
        stream.getTracks().forEach((track) => track.stop());
      };
      setCameraError(null);
      setLensReady(false);
      stopCamera();
      facingModeRef.current = mode;
      setFacingMode(mode);
      const knownId = mode === "user" ? frontDeviceIdRef.current : backDeviceIdRef.current;
      const videoConstraints: MediaTrackConstraints = knownId
        ? { deviceId: { exact: knownId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } };
      const attach = async (stream: MediaStream) => {
        if (!stillCurrent()) {
          dropStream(stream);
          return;
        }
        const openedId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        await rememberVideoInputs(openedId, mode);
        if (!stillCurrent()) {
          dropStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setLensReady(true);
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: captureType === "video",
        });
        await attach(stream);
      } catch (err: unknown) {
        if (!stillCurrent()) return;
        if (knownId) {
          if (mode === "user") frontDeviceIdRef.current = null;
          else backDeviceIdRef.current = null;
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: captureType === "video",
            });
            await attach(stream);
            return;
          } catch {
            /* fall through */
          }
        }
        if (!stillCurrent()) return;
        const message = err instanceof Error ? err.message : t("web.provider.explorePostForm.cameraAccessDenied");
        setCameraError(message);
        toast.error(t("web.provider.explorePostForm.cameraAccessFailed"));
      }
    },
    [captureType, rememberVideoInputs, stopCamera, t],
  );

  useEffect(() => {
    if (captureMode !== "camera") {
      lensRequestRef.current += 1;
      setLensReady(false);
      stopCamera();
      return;
    }
    void openLens(facingModeRef.current);
    return () => {
      lensRequestRef.current += 1;
      stopCamera();
    };
  }, [captureMode, captureType, openLens, stopCamera]);

  useEffect(() => {
    if (!videoTrimPending || captureMode !== "camera") return;
    stopCamera();
    setCaptureMode("idle");
  }, [videoTrimPending, captureMode, stopCamera]);

  const warnTrimInProgress = useCallback(() => {
    toast.info(t("web.provider.explorePostForm.trimVideoFinishFirst"));
  }, [t]);

  const openCameraUi = useCallback(() => {
    if (videoTrimPending) {
      warnTrimInProgress();
      return;
    }
    if (mediaPaths.length >= MAX_MEDIA_ITEMS) {
      toast.error(t("web.provider.explorePostForm.maxMedia", { count: MAX_MEDIA_ITEMS }));
      return;
    }
    facingModeRef.current = "user";
    setFacingMode("user");
    setCaptureMode("camera");
  }, [videoTrimPending, mediaPaths.length, t, warnTrimInProgress]);

  const openGalleryPicker = useCallback(() => {
    if (videoTrimPending) {
      warnTrimInProgress();
      return;
    }
    if (mediaPaths.length >= MAX_MEDIA_ITEMS) {
      toast.error(t("web.provider.explorePostForm.maxMedia", { count: MAX_MEDIA_ITEMS }));
      return;
    }
    fileInputRef.current?.click();
  }, [videoTrimPending, mediaPaths.length, t, warnTrimInProgress]);

  const flipLens = useCallback(() => {
    if (isRecording) return;
    if (videoInputCount > 0 && videoInputCount < 2) {
      toast.info(t("web.provider.explorePostForm.onlyOneCamera"));
      return;
    }
    const next = facingModeRef.current === "user" ? "environment" : "user";
    void openLens(next);
  }, [isRecording, openLens, t, videoInputCount]);

  const readVideoDurationMs = (file: File) =>
    new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(v.src);
        resolve(Math.round((Number.isFinite(v.duration) ? v.duration : 15) * 1000));
      };
      v.onerror = () => resolve(15_000);
      v.src = URL.createObjectURL(file);
    });

  const uploadVideoAfterTrim = useCallback(
    async (file: File, trim: ExploreVideoTrimResult) => {
      setIsUploading(true);
      try {
        const sourceDuration = trim.source_duration_ms;
        const segmentMs = trimWindowDurationMs(trim);
        await fetcher.get("/api/explore/upload");
        const slotRes = await fetcher.post<{
          data: { path: string; signed_url?: string | null; token?: string | null };
        }>("/api/explore/upload", {
          kind: "video",
          size_bytes: file.size,
          mime_type: file.type || "video/mp4",
          duration_ms: sourceDuration,
        });
        const slot = (slotRes as { data?: { path: string; signed_url?: string | null; token?: string | null } })
          ?.data;
        let path = slot?.path;
        if (slot?.signed_url) {
          const put = await fetch(slot.signed_url, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "video/mp4" },
          });
          if (!put.ok) throw new Error("video_upload_failed");
        }
        const slideMeta: ExploreMediaSlideMeta = {
          kind: "video",
          duration_ms: segmentMs,
          source_duration_ms: sourceDuration,
          trim_start_ms: trim.trim_start_ms,
          trim_end_ms: trim.trim_end_ms,
        };
        if (path) {
          setMediaPaths((p) => [...p, path!]);
          setMediaMetaSlides((m) => [...m, slideMeta]);
          setCaptureMode("idle");
          stopCamera();
        }
      } catch {
        toast.error(t("web.provider.explorePostForm.uploadFailed"));
      } finally {
        setIsUploading(false);
      }
    },
    [stopCamera, t],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (mediaPaths.length >= MAX_MEDIA_ITEMS) {
        toast.error(t("web.provider.explorePostForm.maxMedia", { count: MAX_MEDIA_ITEMS }));
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(t("web.provider.explorePostForm.invalidFileType"));
        return;
      }
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
      const maxSize = isVideo ? uploadCaps.maxVideoBytes : uploadCaps.maxImage;
      if (file.size > maxSize) {
        toast.error(
          t("web.provider.explorePostForm.fileTooLarge", {
            size: formatBytesShort(maxSize),
          }),
        );
        return;
      }
      if (isVideo) {
        const durationMs = await readVideoDurationMs(file);
        const item = {
          file,
          videoUrl: URL.createObjectURL(file),
          durationMs,
        };
        setVideoTrimPending((cur) => {
          if (cur) {
            videoTrimQueueRef.current.push(item);
            return cur;
          }
          return item;
        });
        return;
      }
      setIsUploading(true);
      try {
        let path: string | undefined;
        let slideMeta: ExploreMediaSlideMeta = { kind: "image" };
        if (file.size > uploadCaps.maxMultipart) {
          const slotRes = await fetcher.post<{
            data: { path: string; signed_url?: string | null };
          }>("/api/explore/upload", {
            kind: "image",
            size_bytes: file.size,
            mime_type: file.type || "image/jpeg",
          });
          const slot = (slotRes as { data?: { path: string; signed_url?: string | null } })?.data;
          path = slot?.path;
          if (slot?.signed_url) {
            const put = await fetch(slot.signed_url, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type || "image/jpeg" },
            });
            if (!put.ok) throw new Error("image_upload_failed");
          }
          if (path) {
            const fin = await fetcher.post<{
              data: { path: string; display_path: string; width: number; height: number };
            }>("/api/explore/upload/finalize", { path });
            const finData = (fin as { data?: { path: string; display_path: string; width: number; height: number } })
              ?.data;
            if (finData) {
              slideMeta = {
                kind: "image",
                display_path: finData.display_path,
                width: finData.width,
                height: finData.height,
              };
              path = finData.path;
            }
          }
        } else {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetcher.post<{
            data: { path: string; display_path?: string; width?: number; height?: number };
          }>("/api/explore/upload", fd as any);
          const data = (res as { data?: { path: string; display_path?: string; width?: number; height?: number } })
            ?.data;
          path = data?.path;
          slideMeta = {
            kind: "image",
            display_path: data?.display_path ?? null,
            width: data?.width ?? null,
            height: data?.height ?? null,
          };
        }
        if (path) {
          setMediaPaths((p) => [...p, path!]);
          setMediaMetaSlides((m) => [...m, slideMeta]);
          setCaptureMode("idle");
          stopCamera();
        }
      } catch {
        toast.error(t("web.provider.explorePostForm.uploadFailed"));
      } finally {
        setIsUploading(false);
      }
    },
    [mediaPaths.length, stopCamera, t, uploadCaps.maxImage, uploadCaps.maxMultipart, uploadCaps.maxVideoBytes],
  );

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (facingModeRef.current === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        await uploadFile(file);
      },
      "image/jpeg",
      0.92
    );
  }, [uploadFile]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !videoRef.current || mediaRecorderRef.current) return;
    chunksRef.current = [];
    const mimeType =
      MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";
    let recordStream: MediaStream = streamRef.current;
    let mirrorFrame = 0;
    if (facingModeRef.current === "user" && canvasRef.current && videoRef.current.videoWidth) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx && typeof canvas.captureStream === "function") {
        const paint = () => {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          mirrorFrame = requestAnimationFrame(paint);
        };
        paint();
        const mirrored = canvas.captureStream(30);
        const audio = streamRef.current.getAudioTracks()[0];
        if (audio) mirrored.addTrack(audio);
        recordStream = mirrored;
      }
    }
    const recorder = new MediaRecorder(recordStream, mimeType
      ? { mimeType, videoBitsPerSecond: 2500000 }
      : { videoBitsPerSecond: 2500000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    const recMimeType = recorder.mimeType;
    recorder.onstop = async () => {
      const elapsed = Date.now() - recordingStartedAtRef.current;
      if (elapsed < MIN_VIDEO_RECORD_MS) {
        toast.info(t("web.provider.explorePostForm.recordingTooShort"));
        chunksRef.current = [];
        return;
      }
      const type = recMimeType || "video/webm";
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size < 1024) return;
      const file = new File([blob], `record-${Date.now()}.${ext}`, { type });
      await uploadFile(file);
    };
    recorder.addEventListener("stop", () => {
      if (mirrorFrame) cancelAnimationFrame(mirrorFrame);
    });
    recordingStartedAtRef.current = Date.now();
    try {
      recorder.start(250);
    } catch {
      if (mirrorFrame) cancelAnimationFrame(mirrorFrame);
      toast.error(t("web.provider.explorePostForm.cameraAccessFailed"));
      return;
    }
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordProgressMs(0);
  }, [uploadFile, t]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordProgressMs(0);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - recordingStartedAtRef.current;
      setRecordProgressMs(elapsed);
      if (elapsed >= uploadCaps.maxVideoDurationMs) {
        stopRecording();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [isRecording, stopRecording, uploadCaps.maxVideoDurationMs]);

  const cancelVideoTrim = useCallback(() => {
    setVideoTrimPending((pending) => {
      if (pending) URL.revokeObjectURL(pending.videoUrl);
      return videoTrimQueueRef.current.shift() ?? null;
    });
  }, []);

  const confirmVideoTrim = useCallback(
    (trim: ExploreVideoTrimResult) => {
      setVideoTrimPending((pending) => {
        if (pending) {
          URL.revokeObjectURL(pending.videoUrl);
          void uploadVideoAfterTrim(pending.file, trim);
        }
        return videoTrimQueueRef.current.shift() ?? null;
      });
    },
    [uploadVideoAfterTrim],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const remainingSlots = MAX_MEDIA_ITEMS - mediaPaths.length;
    if (remainingSlots <= 0) {
      toast.error(t("web.provider.explorePostForm.maxMedia", { count: MAX_MEDIA_ITEMS }));
      return;
    }
    if (files.length > remainingSlots) {
      toast.error(t("web.provider.explorePostForm.remainingSlots", { count: remainingSlots }));
    }

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(t("web.provider.explorePostForm.invalidTypeNamed", { name: file.name }));
        continue;
      }
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
      const maxSize = isVideo ? uploadCaps.maxVideoBytes : uploadCaps.maxImage;
      if (file.size > maxSize) {
        toast.error(
          t("web.provider.explorePostForm.fileTooLargeNamed", {
            name: file.name,
            size: formatBytesShort(maxSize),
          }),
        );
        continue;
      }
      await uploadFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeMedia = (index: number) => {
    setMediaPaths((p) => p.filter((_, i) => i !== index));
    setMediaMetaSlides((m) => m.filter((_, i) => i !== index));
    setActiveSlide((prev) => Math.min(prev, Math.max(0, mediaPaths.length - 2)));
  };

  const addTextOverlayToActiveSlide = () => {
    const text = overlayDraft.trim();
    if (!text) return;
    const layer: ExploreTextOverlay = {
      text: text.slice(0, 80),
      x: 0.5,
      y: 0.35,
      font_size: 0.06,
      color: "#ffffff",
      align: "center",
    };
    setMediaMetaSlides((slides) => {
      const next = [...slides];
      const base = next[activeSlide] ?? {
        kind: isVideoPath(mediaPaths[activeSlide] ?? "") ? "video" : "image",
      };
      next[activeSlide] = {
        ...base,
        text_overlays: [...(base.text_overlays ?? []), layer],
      };
      return next;
    });
    setOverlayDraft("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (videoTrimPending) {
      warnTrimInProgress();
      return;
    }
    if (isUploading) {
      return;
    }
    if (!mediaPaths.length) {
      toast.error(t("web.provider.explorePostForm.addMediaRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      if (post) {
        await fetcher.patch(`/api/explore/posts/${post.id}`, {
          caption: caption || null,
          media_urls: mediaPaths,
          media_meta: mediaMetaSlides,
          tags,
          primary_category_slug: primaryCategorySlug,
          offering_id: offeringId || null,
          status: post.status,
          sound_id: hasVideoFirstForSound ? soundId : null,
        });
        toast.success(t("web.provider.explorePostForm.postUpdated"));
      } else {
        await fetcher.post("/api/explore/posts", {
          caption: caption || null,
          media_urls: mediaPaths,
          media_meta: mediaMetaSlides,
          tags,
          primary_category_slug: primaryCategorySlug,
          offering_id: offeringId || undefined,
          status: "published",
          ...(hasVideoFirstForSound && soundId ? { sound_id: soundId } : {}),
          ...(alsoAddToGallery ? { also_add_to_gallery: true } : {}),
          ...(preseedBookingId ? { booking_id: preseedBookingId } : {}),
        });
        setIsPosted(true);
        toast.success(t("web.provider.explorePostForm.posted"));
        await new Promise((r) => setTimeout(r, 800));
      }
      onSuccess();
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : t("web.provider.explorePostForm.saveFailed");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const supabaseUrl =
    typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : "";
  const getMediaUrl = (path: string) =>
    `${supabaseUrl}/storage/v1/object/public/explore-posts/${path}`;

  const scrollToSlide = useCallback((index: number) => {
    const el = carouselRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement;
    if (child) {
      child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
    setActiveSlide(index);
  }, []);

  // Camera capture UI
  if (captureMode === "camera") {
    return (
      <div className="flex flex-col">
        <div className="relative aspect-[4/5] max-h-[420px] rounded-2xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
          />
          <canvas ref={canvasRef} className="hidden" />
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4 text-center">
              {cameraError}
            </div>
          )}

          {/* Top bar: close, photo/video, flip lens */}
          <div className="absolute top-0 start-0 end-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/75 via-black/35 to-transparent">
            <button
              type="button"
              onClick={() => {
                if (isRecording) return;
                setCaptureMode("idle");
                stopCamera();
              }}
              aria-label={t("web.provider.explorePostForm.cancel")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex gap-1 rounded-full bg-black/40 p-1">
              <button
                type="button"
                onClick={() => {
                  if (!isRecording) setCaptureType("photo");
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  captureType === "photo" ? "bg-white text-black" : "text-white"
                }`}
              >
                {t("web.provider.explorePostForm.photo")}
              </button>
              <button
                type="button"
                onClick={() => !isRecording && setCaptureType("video")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  captureType === "video" ? "bg-white text-black" : "text-white"
                }`}
              >
                {t("web.provider.explorePostForm.video")}
              </button>
            </div>
            <button
              type="button"
              onClick={flipLens}
              disabled={isRecording || !lensReady || (videoInputCount > 0 && videoInputCount < 2)}
              aria-label={
                facingMode === "user"
                  ? t("web.provider.explorePostForm.switchToBack")
                  : t("web.provider.explorePostForm.switchToFront")
              }
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 disabled:opacity-40"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          </div>

          {captureType === "video" && isRecording ? (
            <div className="absolute top-16 start-0 end-0 flex justify-center pointer-events-none">
              <span className="inline-flex items-center gap-2 rounded-full bg-red-600/95 px-3 py-1 text-xs font-semibold text-white tabular-nums shadow-sm">
                <span className="h-2 w-2 rounded-full bg-white" />
                {t("web.provider.explorePostForm.releaseToFinish")}
                {" · "}
                {Math.max(0, Math.ceil((uploadCaps.maxVideoDurationMs - recordProgressMs) / 1000))}s
              </span>
            </div>
          ) : null}

          {/* Capture control */}
          <div className="absolute bottom-0 start-0 end-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-6 pb-6 pt-16">
            <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
              {!lensReady
                ? t("web.provider.explorePostForm.openingCamera")
                : facingMode === "user"
                  ? t("web.provider.explorePostForm.lensFront")
                  : t("web.provider.explorePostForm.lensBack")}
            </span>
            <p className="text-center text-sm font-medium text-white">
              {lensReady
                ? captureType === "video"
                  ? t("web.provider.explorePostForm.holdToRecord")
                  : t("web.provider.explorePostForm.tapForPhoto")
                : null}
            </p>
            <div className="relative flex h-[84px] w-[84px] items-center justify-center">
              {captureType === "video" ? (
                <ExploreRecordProgressRing
                  size={84}
                  progress={recordProgressMs / Math.max(1, uploadCaps.maxVideoDurationMs)}
                  recording={isRecording}
                />
              ) : (
                <span className="pointer-events-none absolute inset-0 rounded-full border-4 border-white" />
              )}
              <button
                type="button"
                disabled={isUploading || !!cameraError || !lensReady}
                onClick={captureType === "photo" ? capturePhoto : undefined}
                onPointerDown={(e) => {
                  if (captureType !== "video" || isUploading || cameraError || !lensReady) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startRecording();
                }}
                onPointerUp={() => {
                  if (captureType === "video") stopRecording();
                }}
                onPointerCancel={() => {
                  if (captureType === "video") stopRecording();
                }}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative z-10 transition-transform disabled:opacity-40 ${
                  captureType === "video" && isRecording
                    ? "h-7 w-7 rounded-md bg-red-500"
                    : "h-16 w-16 rounded-full bg-white hover:scale-105 active:scale-95"
                }`}
                aria-label={
                  captureType === "video"
                    ? t("web.provider.explorePostForm.holdToRecord")
                    : t("web.provider.explorePostForm.photo")
                }
              />
            </div>
          </div>
        </div>
        {isUploading && (
          <div className="mt-3 flex items-center gap-2 text-primary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("web.provider.explorePostForm.uploading")}
          </div>
        )}
      </div>
    );
  }

  // Main form UI
  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      <div className="relative">
        {mediaPaths.length > 0 ? (
          <div className="relative rounded-2xl overflow-hidden bg-black">
            <div
              ref={carouselRef}
              className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide gap-0"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              onScroll={(e) => {
                const el = e.currentTarget;
                const scrollLeft = el.scrollLeft;
                const width = el.offsetWidth;
                const index = Math.round(scrollLeft / width);
                setActiveSlide(Math.min(index, mediaPaths.length - 1));
              }}
            >
              {mediaPaths.map((path, i) => (
                <div
                  key={path}
                  className="flex-shrink-0 w-full snap-center snap-always aspect-square"
                >
                  <div className="relative w-full h-full">
                    {isVideoPath(path) ? (
                      <>
                        <video
                          src={getMediaUrl(path)}
                          controls
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <LibraryClipRing
                          trimStartMs={mediaMetaSlides[i]?.trim_start_ms}
                          trimEndMs={mediaMetaSlides[i]?.trim_end_ms}
                          sourceMs={mediaMetaSlides[i]?.source_duration_ms}
                          label={t("web.provider.explorePostForm.clipWindowA11y")}
                        />
                      </>
                    ) : (
                      <img
                        src={getMediaUrl(path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                    <ExploreTextOverlayLayer overlays={mediaMetaSlides[i]?.text_overlays ?? []} />
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute top-2 end-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {mediaPaths.length > 1 && (
                      <span className="absolute top-2 start-2 px-2 py-0.5 bg-black/50 rounded-full text-white text-xs backdrop-blur-sm">
                        {i + 1} / {mediaPaths.length}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {mediaPaths.length > 1 && (
              <div className="absolute bottom-3 start-0 end-0 flex justify-center gap-1.5">
                {mediaPaths.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => scrollToSlide(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === activeSlide ? "bg-white w-4" : "bg-white/50 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
            )}

            {mediaPaths.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollToSlide(Math.max(0, activeSlide - 1))}
                  className="hidden sm:flex absolute start-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    scrollToSlide(Math.min(mediaPaths.length - 1, activeSlide + 1))
                  }
                  className="hidden sm:flex absolute end-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`rounded-2xl border-2 border-dashed overflow-hidden ${
              isDragging ? "border-primary bg-primary/5" : "border-gray-300 bg-gray-50"
            }`}
          >
            <div className="flex flex-col sm:flex-row">
              <button
                type="button"
                onClick={openCameraUi}
                disabled={isUploading || mediaPaths.length >= MAX_MEDIA_ITEMS}
                className="flex-1 aspect-[4/5] sm:aspect-square max-h-[280px] sm:max-h-none flex flex-col items-center justify-center gap-3 hover:bg-gray-100 transition-colors active:scale-[0.99] border-b sm:border-b-0 sm:border-e border-gray-200"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <span className="text-gray-700 font-medium">{t("web.provider.explorePostForm.camera")}</span>
                <span className="text-xs text-gray-500">{t("web.provider.explorePostForm.takePhotoOrVideo")}</span>
              </button>
              <button
                type="button"
                onClick={openGalleryPicker}
                disabled={isUploading || mediaPaths.length >= MAX_MEDIA_ITEMS}
                className="flex-1 aspect-[4/5] sm:aspect-square max-h-[280px] sm:max-h-none flex flex-col items-center justify-center gap-3 hover:bg-gray-100 transition-colors active:scale-[0.99]"
              >
                {isUploading ? (
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-500" />
                    </div>
                    <span className="text-gray-700 font-medium">{t("web.provider.explorePostForm.gallery")}</span>
                    <span className="text-xs text-gray-500">
                      {t("web.provider.explorePostForm.galleryHint")}
                    </span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(",")}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {mediaPaths.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              {t("web.provider.explorePostForm.onMediaText")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={overlayDraft}
                maxLength={80}
                onChange={(e) => setOverlayDraft(e.target.value)}
                placeholder={t("web.provider.explorePostForm.onMediaTextPlaceholder")}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTextOverlayToActiveSlide}>
                {t("web.provider.explorePostForm.addTextLayer")}
              </Button>
            </div>
          </div>
        )}

        {mediaPaths.length > 0 && (
          <button
            type="button"
            onClick={openCameraUi}
            disabled={isUploading || mediaPaths.length >= MAX_MEDIA_ITEMS}
            className="mt-3 flex items-center gap-2 text-primary text-sm font-medium hover:underline disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            {t("web.provider.explorePostForm.takePhotoOrVideo")}
          </button>
        )}

        {mediaPaths.length > 0 && (
          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={isUploading || mediaPaths.length >= MAX_MEDIA_ITEMS}
            className="mt-1 flex items-center gap-2 text-gray-600 text-sm font-medium hover:underline disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {t("web.provider.explorePostForm.addFromGallery")}
          </button>
        )}

        {mediaPaths.length > 0 && (
          <input
            ref={fileInputRef}
            type="file"
            accept={[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(",")}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        )}
      </div>

      <div className="mt-6 flex-1 min-h-0">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full min-h-[100px] max-h-[160px] resize-none rounded-xl border border-gray-200 px-4 py-3 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
          placeholder={t("web.provider.explorePostForm.captionPlaceholder")}
          rows={3}
        />
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            {t("web.provider.explorePostForm.category")} <span className="text-gray-400 font-normal">{t("web.provider.explorePostForm.categoryHint")}</span>
          </label>
          <select
            value={primaryCategorySlug ?? ""}
            onChange={(e) => setPrimaryCategorySlug(e.target.value || null)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">{t("web.provider.explorePostForm.none")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Link to service (Book this look) */}
      {offerings.length > 0 && (
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            {t("web.provider.explorePostForm.linkToService")} <span className="text-gray-400 font-normal">{t("web.provider.explorePostForm.linkToServiceHint")}</span>
          </label>
          <select
            value={offeringId ?? ""}
            onChange={(e) => setOfferingId(e.target.value || null)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">{t("web.provider.explorePostForm.none")}</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tags */}
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          {t("web.provider.explorePostForm.tags")} <span className="text-gray-400 font-normal">{t("web.provider.explorePostForm.tagsHint")}</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
            >
              #{tag}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                className="ms-0.5 hover:text-primary/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g, ""))}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                e.preventDefault();
                const newTag = tagInput.trim().replace(/\s+/g, "-");
                if (newTag && !tags.includes(newTag) && tags.length < 10) {
                  setTags((prev) => [...prev, newTag]);
                }
                setTagInput("");
              }
            }}
            placeholder={t("web.provider.explorePostForm.tagsPlaceholder")}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            maxLength={30}
          />
          <button
            type="button"
            onClick={() => {
              const newTag = tagInput.trim().replace(/\s+/g, "-");
              if (newTag && !tags.includes(newTag) && tags.length < 10) {
                setTags((prev) => [...prev, newTag]);
              }
              setTagInput("");
            }}
            disabled={!tagInput.trim() || tags.length >= 10}
            className="px-4 py-2 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("web.provider.explorePostForm.add")}
          </button>
        </div>
        {/* Quick-add suggestions */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {["hair", "nails", "makeup", "skincare", "lashes", "braids", "barber", "spa", "facial", "balayage", "extensions", "gel-nails"]
            .filter((s) => !tags.includes(s))
            .slice(0, 8)
            .map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  if (tags.length < 10) setTags((prev) => [...prev, suggestion]);
                }}
                className="px-2.5 py-1 rounded-full border border-gray-200 text-xs text-gray-500 hover:border-primary hover:text-primary transition-colors"
              >
                +{suggestion}
              </button>
            ))}
        </div>
        {tags.length >= 10 && (
          <p className="text-xs text-gray-400 mt-1">{t("web.provider.explorePostForm.maxTags")}</p>
        )}
      </div>

      {hasVideoFirstForSound && soundCatalogEnabled ? (
        <ExploreSoundPicker
          sounds={providerSounds}
          value={soundId}
          onChange={setSoundId}
          disabled={isSubmitting || isUploading}
          labels={soundPickerLabels}
        />
      ) : null}

      {!post && (
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={alsoAddToGallery}
            onChange={(e) => setAlsoAddToGallery(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">{t("web.provider.explorePostForm.alsoAddToPortfolio")}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t("web.provider.explorePostForm.alsoAddToPortfolioHint")}</span>
          </span>
        </label>
      )}

      <div className="mt-6 flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || isUploading || !!videoTrimPending || !mediaPaths.length}
          className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-base"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPosted ? (
            t("web.provider.explorePostForm.posted")
          ) : post ? (
            t("web.provider.explorePostForm.saveChanges")
          ) : (
            t("web.provider.explorePostForm.share")
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-12 rounded-xl px-6"
          >
            {t("web.provider.explorePostForm.cancel")}
          </Button>
        )}
      </div>

      {videoTrimPending ? (
        <ExploreVideoTrimModal
          open
          videoUrl={videoTrimPending.videoUrl}
          fullDurationMs={videoTrimPending.durationMs}
          maxClipMs={uploadCaps.maxVideoDurationMs}
          onConfirm={confirmVideoTrim}
          onCancel={cancelVideoTrim}
        />
      ) : null}
    </form>
  );
}
