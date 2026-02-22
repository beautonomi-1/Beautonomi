"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
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
import type { ExplorePost } from "@/types/explore";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

function isVideoPath(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface ExplorePostFormProps {
  post?: ExplorePost;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function ExplorePostForm({
  post,
  onSuccess,
  onCancel,
}: ExplorePostFormProps) {
  const [caption, setCaption] = useState(post?.caption ?? "");
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPosted, setIsPosted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [captureMode, setCaptureMode] = useState<"idle" | "camera" | "gallery">("idle");
  const [captureType, setCaptureType] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const triggerFileSelect = () => fileInputRef.current?.click();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (mode?: "user" | "environment") => {
      const nextMode = mode ?? facingMode;
      if (mode) setFacingMode(mode);
      setCameraError(null);
      stopCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: captureType === "video",
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        setCameraError(err?.message || "Camera access denied");
        toast.error("Could not access camera");
      }
    },
    [captureType, stopCamera, facingMode]
  );

  useEffect(() => {
    if (captureMode === "camera") {
      startCamera();
    }
    return () => {
      if (captureMode !== "camera") stopCamera();
    };
  }, [captureMode, startCamera, stopCamera]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !videoRef.current) return;
    chunksRef.current = [];
    const mimeType =
      MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";
    const recorder = new MediaRecorder(streamRef.current, mimeType
      ? { mimeType, videoBitsPerSecond: 2500000 }
      : { videoBitsPerSecond: 2500000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    const recMimeType = recorder.mimeType;
    recorder.onstop = async () => {
      const type = recMimeType || "video/webm";
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `record-${Date.now()}.${ext}`, { type });
      await uploadFile(file);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const uploadFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Invalid file type");
      return;
    }
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      toast.error(`File too large. Max ${isVideo ? "50MB" : "5MB"}.`);
      return;
    }
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetcher.post<{ data: { path: string } }>(
        "/api/explore/upload",
        fd as unknown
      );
      const path = (res as any)?.data?.path;
      if (path) {
        setMediaPaths((p) => [...p, path]);
        setCaptureMode("idle");
        stopCamera();
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Invalid type. Use JPEG, PNG, WebP, MP4, or WebM.`);
        continue;
      }
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        toast.error(`${file.name}: Max ${isVideo ? "50MB" : "5MB"}.`);
        continue;
      }
      await uploadFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeMedia = (index: number) => {
    setMediaPaths((p) => p.filter((_, i) => i !== index));
    setActiveSlide((prev) => Math.min(prev, Math.max(0, mediaPaths.length - 2)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaPaths.length) {
      toast.error("Add at least one photo or video.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (post) {
        await fetcher.patch(`/api/explore/posts/${post.id}`, {
          caption: caption || null,
          media_urls: mediaPaths,
          tags,
          status: post.status,
        });
        toast.success("Post updated.");
      } else {
        await fetcher.post("/api/explore/posts", {
          caption: caption || null,
          media_urls: mediaPaths,
          tags,
          status: "published",
        });
        setIsPosted(true);
        toast.success("Posted!");
        await new Promise((r) => setTimeout(r, 800));
      }
      onSuccess();
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Failed to save post.";
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
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4 text-center">
              {cameraError}
            </div>
          )}

          {/* Top bar: back, switch camera, photo/video toggle */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
            <button
              type="button"
              onClick={() => {
                setCaptureMode("idle");
                stopCamera();
              }}
              className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex gap-1 rounded-full bg-black/40 p-1">
              <button
                type="button"
                onClick={() => setCaptureType("photo")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  captureType === "photo" ? "bg-white text-black" : "text-white"
                }`}
              >
                Photo
              </button>
              <button
                type="button"
                onClick={() => !isRecording && setCaptureType("video")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  captureType === "video" ? "bg-white text-black" : "text-white"
                }`}
              >
                Video
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = facingMode === "user" ? "environment" : "user";
                startCamera(next);
              }}
              className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Capture button */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            <button
              type="button"
              disabled={isUploading || !!cameraError}
              onMouseDown={captureType === "photo" ? capturePhoto : undefined}
              onMouseUp={captureType === "video" ? undefined : undefined}
              onTouchStart={captureType === "photo" ? capturePhoto : undefined}
              onClick={
                captureType === "video"
                  ? isRecording
                    ? stopRecording
                    : startRecording
                  : undefined
              }
              className={`relative w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${
                isRecording
                  ? "bg-red-500 border-red-600 animate-pulse"
                  : "bg-white/90 border-white hover:scale-105 active:scale-95"
              }`}
            >
              {captureType === "video" && isRecording && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 text-red-500 text-xs font-medium">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Recording
                </div>
              )}
            </button>
          </div>
        </div>
        {isUploading && (
          <div className="mt-3 flex items-center gap-2 text-[#FF0077] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
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
                      <video
                        src={getMediaUrl(path)}
                        controls
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={getMediaUrl(path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {mediaPaths.length > 1 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 rounded-full text-white text-xs backdrop-blur-sm">
                        {i + 1} / {mediaPaths.length}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {mediaPaths.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
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
                  className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    scrollToSlide(Math.min(mediaPaths.length - 1, activeSlide + 1))
                  }
                  className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
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
              isDragging ? "border-[#FF0077] bg-[#FF0077]/5" : "border-gray-300 bg-gray-50"
            }`}
          >
            <div className="flex flex-col sm:flex-row">
              <button
                type="button"
                onClick={() => setCaptureMode("camera")}
                disabled={isUploading}
                className="flex-1 aspect-[4/5] sm:aspect-square max-h-[280px] sm:max-h-none flex flex-col items-center justify-center gap-3 hover:bg-gray-100 transition-colors active:scale-[0.99] border-b sm:border-b-0 sm:border-r border-gray-200"
              >
                <div className="w-16 h-16 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-[#FF0077]" />
                </div>
                <span className="text-gray-700 font-medium">Camera</span>
                <span className="text-xs text-gray-500">Take photo or video</span>
              </button>
              <button
                type="button"
                onClick={triggerFileSelect}
                disabled={isUploading}
                className="flex-1 aspect-[4/5] sm:aspect-square max-h-[280px] sm:max-h-none flex flex-col items-center justify-center gap-3 hover:bg-gray-100 transition-colors active:scale-[0.99]"
              >
                {isUploading ? (
                  <Loader2 className="w-16 h-16 text-[#FF0077] animate-spin" />
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-500" />
                    </div>
                    <span className="text-gray-700 font-medium">Gallery</span>
                    <span className="text-xs text-gray-500">
                      Photos · Videos · Max 5MB/50MB
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
          <button
            type="button"
            onClick={() => {
              setCaptureMode("camera");
            }}
            disabled={isUploading}
            className="mt-3 flex items-center gap-2 text-[#FF0077] text-sm font-medium hover:underline disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            Take photo or video
          </button>
        )}

        {mediaPaths.length > 0 && (
          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={isUploading}
            className="mt-1 flex items-center gap-2 text-gray-600 text-sm font-medium hover:underline disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Add from gallery
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
          className="w-full min-h-[100px] max-h-[160px] resize-none rounded-xl border border-gray-200 px-4 py-3 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF0077]/30 focus:border-[#FF0077] bg-white"
          placeholder="Write a caption..."
          rows={3}
        />
      </div>

      {/* Tags */}
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Tags <span className="text-gray-400 font-normal">(helps customers discover your post)</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FF0077]/10 text-[#FF0077] text-sm font-medium"
            >
              #{tag}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                className="ml-0.5 hover:text-[#FF0077]/70"
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
            placeholder="e.g. hair, braids, balayage..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF0077]/30 focus:border-[#FF0077]"
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
            Add
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
                className="px-2.5 py-1 rounded-full border border-gray-200 text-xs text-gray-500 hover:border-[#FF0077] hover:text-[#FF0077] transition-colors"
              >
                +{suggestion}
              </button>
            ))}
        </div>
        {tags.length >= 10 && (
          <p className="text-xs text-gray-400 mt-1">Maximum 10 tags per post</p>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || !mediaPaths.length}
          className="flex-1 h-12 rounded-xl bg-[#FF0077] hover:bg-[#D60565] text-white font-semibold text-base"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPosted ? (
            "Posted!"
          ) : post ? (
            "Save changes"
          ) : (
            "Share"
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-12 rounded-xl px-6"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
