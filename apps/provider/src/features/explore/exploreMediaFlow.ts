import { isVideoAsset, type PickedAsset } from "@/lib/explore-picked-asset";
import type { ExploreVideoTrimWindow } from "@/lib/explore-video-trim";
import { trimWindowDurationMs } from "@/lib/explore-video-trim";

export type MediaFlowTarget = "create" | "edit";

export type CameraCapturePayload = {
  uri: string;
  mimeType: string;
  fileName: string;
  isVideo: boolean;
  source_duration_ms?: number;
  facing?: "front" | "back";
};

export type LibraryBatchSlot =
  | { kind: "image"; asset: PickedAsset }
  | { kind: "video"; asset: PickedAsset; resolved?: PickedAsset | "skipped" };

export type ExploreMediaFlowState =
  | { step: "idle" }
  | { step: "hidingDraft"; kind: "camera" | "library"; target: MediaFlowTarget }
  | {
      step: "camera";
      target: MediaFlowTarget;
      initialMode: "photo" | "video";
      initialFacing: "front" | "back";
    }
  | { step: "hidingCamera"; target: MediaFlowTarget; capture: CameraCapturePayload | null }
  | { step: "picking"; target: MediaFlowTarget }
  | {
      step: "trim";
      target: MediaFlowTarget;
      source: "camera" | "library" | "retrim";
      current: PickedAsset;
      libraryBatch?: LibraryBatchSlot[];
      editIndex?: number;
      retakeFacing?: "front" | "back";
    }
  | {
      step: "hidingTrim";
      resume: ExploreMediaFlowState;
      pendingCommits: MediaFlowCommit[];
      trimUi: {
        target: MediaFlowTarget;
        source: "camera" | "library" | "retrim";
        current: PickedAsset;
        libraryBatch?: LibraryBatchSlot[];
        editIndex?: number;
        retakeFacing?: "front" | "back";
      };
    };

export type MediaFlowAction =
  | { type: "OPEN_CAMERA"; target: MediaFlowTarget }
  | { type: "OPEN_LIBRARY"; target: MediaFlowTarget }
  | { type: "DRAFT_HIDDEN" }
  | { type: "CAPTURED"; capture: CameraCapturePayload }
  | { type: "CAMERA_CLOSED" }
  | { type: "CAMERA_HIDDEN" }
  | { type: "PICK_CANCELLED" }
  | {
      type: "LIBRARY_PICKED";
      batch: LibraryBatchSlot[];
      firstVideo: PickedAsset | null;
    }
  | { type: "TRIM_CONFIRM"; trim: ExploreVideoTrimWindow; sourceDurationMs: number }
  | { type: "TRIM_CANCEL" }
  | { type: "TRIM_HIDDEN" }
  | { type: "RETRIM"; target: MediaFlowTarget; index: number; asset: PickedAsset }
  | { type: "RESET" };

export type MediaFlowCommit =
  | { type: "append"; target: MediaFlowTarget; assets: PickedAsset[] }
  | { type: "replace"; target: MediaFlowTarget; index: number; asset: PickedAsset }
  | { type: "appendOne"; target: MediaFlowTarget; asset: PickedAsset };

export type MediaFlowReducerResult = {
  state: ExploreMediaFlowState;
  commits: MediaFlowCommit[];
};

function mapCaptureToAsset(c: CameraCapturePayload): PickedAsset {
  return {
    uri: c.uri,
    mimeType: c.mimeType,
    fileName: c.fileName,
    isVideo: c.isVideo,
    ...(c.source_duration_ms ? { source_duration_ms: c.source_duration_ms } : {}),
  };
}

function trimmedAsset(base: PickedAsset, trim: ExploreVideoTrimWindow, sourceDurationMs: number): PickedAsset {
  return {
    ...base,
    source_duration_ms: sourceDurationMs,
    trim_start_ms: trim.trim_start_ms,
    trim_end_ms: trim.trim_end_ms,
    duration_ms: trimWindowDurationMs(trim),
  };
}

function resolveLibraryBatch(batch: LibraryBatchSlot[]): PickedAsset[] {
  const out: PickedAsset[] = [];
  for (const slot of batch) {
    if (slot.kind === "image") out.push(slot.asset);
    else if (slot.resolved && slot.resolved !== "skipped") out.push(slot.resolved);
  }
  return out;
}

function findNextUnresolvedVideoIndex(batch: LibraryBatchSlot[], from: number): number {
  for (let i = from; i < batch.length; i++) {
    const s = batch[i];
    if (s?.kind === "video" && s.resolved === undefined) return i;
  }
  return -1;
}

function markVideoResolved(batch: LibraryBatchSlot[], index: number, resolved: PickedAsset | "skipped"): LibraryBatchSlot[] {
  return batch.map((slot, i) => {
    if (i !== index || slot.kind !== "video") return slot;
    return { ...slot, resolved };
  });
}

function deferTrimClose(
  trimState: Extract<ExploreMediaFlowState, { step: "trim" }>,
  result: MediaFlowReducerResult,
): MediaFlowReducerResult {
  return {
    state: {
      step: "hidingTrim",
      resume: result.state,
      pendingCommits: result.commits,
      trimUi: {
        target: trimState.target,
        source: trimState.source,
        current: trimState.current,
        libraryBatch: trimState.libraryBatch,
        editIndex: trimState.editIndex,
        retakeFacing: trimState.retakeFacing,
      },
    },
    commits: [],
  };
}

function advanceAfterLibraryTrim(
  target: MediaFlowTarget,
  batch: LibraryBatchSlot[],
  justResolvedIndex: number,
  resolved: PickedAsset | "skipped",
): MediaFlowReducerResult {
  const updated = markVideoResolved(batch, justResolvedIndex, resolved);
  const nextIdx = findNextUnresolvedVideoIndex(updated, 0);
  if (nextIdx >= 0) {
    const nextSlot = updated[nextIdx];
    if (nextSlot.kind !== "video") {
      return { state: { step: "idle" }, commits: [{ type: "append", target, assets: resolveLibraryBatch(updated) }] };
    }
    return {
      state: {
        step: "trim",
        target,
        source: "library",
        current: nextSlot.asset,
        libraryBatch: updated,
      },
      commits: [],
    };
  }
  return {
    state: { step: "idle" },
    commits: [{ type: "append", target, assets: resolveLibraryBatch(updated) }],
  };
}

export function exploreMediaFlowReducer(
  state: ExploreMediaFlowState,
  action: MediaFlowAction,
): MediaFlowReducerResult {
  switch (action.type) {
    case "RESET":
      return { state: { step: "idle" }, commits: [] };

    case "OPEN_CAMERA":
      if (state.step !== "idle") return { state, commits: [] };
      return { state: { step: "hidingDraft", kind: "camera", target: action.target }, commits: [] };

    case "OPEN_LIBRARY":
      if (state.step !== "idle") return { state, commits: [] };
      return { state: { step: "hidingDraft", kind: "library", target: action.target }, commits: [] };

    case "DRAFT_HIDDEN":
      if (state.step !== "hidingDraft") return { state, commits: [] };
      if (state.kind === "camera") {
        return {
          state: {
            step: "camera",
            target: state.target,
            initialMode: "photo",
            initialFacing: "front",
          },
          commits: [],
        };
      }
      return { state: { step: "picking", target: state.target }, commits: [] };

    case "CAPTURED":
      if (state.step !== "camera") return { state, commits: [] };
      return {
        state: { step: "hidingCamera", target: state.target, capture: action.capture },
        commits: [],
      };

    case "CAMERA_CLOSED":
      if (state.step !== "camera") return { state, commits: [] };
      return { state: { step: "hidingCamera", target: state.target, capture: null }, commits: [] };

    case "CAMERA_HIDDEN": {
      if (state.step !== "hidingCamera") return { state, commits: [] };
      const cap = state.capture;
      if (!cap) return { state: { step: "idle" }, commits: [] };
      const asset = mapCaptureToAsset(cap);
      if (cap.isVideo) {
        return {
          state: {
            step: "trim",
            target: state.target,
            source: "camera",
            current: asset,
            retakeFacing: cap.facing ?? "front",
          },
          commits: [],
        };
      }
      return {
        state: { step: "idle" },
        commits: [{ type: "appendOne", target: state.target, asset }],
      };
    }

    case "PICK_CANCELLED":
      if (state.step !== "picking") return { state, commits: [] };
      return { state: { step: "idle" }, commits: [] };

    case "LIBRARY_PICKED": {
      if (state.step !== "picking") return { state, commits: [] };
      if (action.firstVideo) {
        return {
          state: {
            step: "trim",
            target: state.target,
            source: "library",
            current: action.firstVideo,
            libraryBatch: action.batch,
          },
          commits: [],
        };
      }
      const images = action.batch.filter((s): s is { kind: "image"; asset: PickedAsset } => s.kind === "image");
      return {
        state: { step: "idle" },
        commits: [{ type: "append", target: state.target, assets: images.map((i) => i.asset) }],
      };
    }

    case "TRIM_CONFIRM": {
      if (state.step !== "trim") return { state, commits: [] };
      const trimmed = trimmedAsset(state.current, action.trim, action.sourceDurationMs);
      let result: MediaFlowReducerResult;
      if (state.source === "retrim" && state.editIndex != null) {
        result = {
          state: { step: "idle" },
          commits: [{ type: "replace", target: state.target, index: state.editIndex, asset: trimmed }],
        };
      } else if (state.source === "camera") {
        result = {
          state: { step: "idle" },
          commits: [{ type: "appendOne", target: state.target, asset: trimmed }],
        };
      } else if (state.source === "library" && state.libraryBatch) {
        const videoIndex = state.libraryBatch.findIndex(
          (s) => s.kind === "video" && s.asset.uri === state.current.uri && s.resolved === undefined,
        );
        const idx = videoIndex >= 0 ? videoIndex : findNextUnresolvedVideoIndex(state.libraryBatch, 0);
        result = advanceAfterLibraryTrim(state.target, state.libraryBatch, idx, trimmed);
      } else {
        result = { state: { step: "idle" }, commits: [{ type: "appendOne", target: state.target, asset: trimmed }] };
      }
      return deferTrimClose(state, result);
    }

    case "TRIM_CANCEL": {
      if (state.step !== "trim") return { state, commits: [] };
      let result: MediaFlowReducerResult;
      if (state.source === "retrim") {
        result = { state: { step: "idle" }, commits: [] };
      } else if (state.source === "camera") {
        result = {
          state: {
            step: "camera",
            target: state.target,
            initialMode: "video",
            initialFacing: state.retakeFacing ?? "front",
          },
          commits: [],
        };
      } else if (state.source === "library" && state.libraryBatch) {
        const videoIndex = state.libraryBatch.findIndex(
          (s) => s.kind === "video" && s.asset.uri === state.current.uri && s.resolved === undefined,
        );
        const idx = videoIndex >= 0 ? videoIndex : findNextUnresolvedVideoIndex(state.libraryBatch, 0);
        result = advanceAfterLibraryTrim(state.target, state.libraryBatch, idx, "skipped");
      } else {
        result = { state: { step: "idle" }, commits: [] };
      }
      return deferTrimClose(state, result);
    }

    case "TRIM_HIDDEN":
      if (state.step !== "hidingTrim") return { state, commits: [] };
      return { state: state.resume, commits: state.pendingCommits };

    case "RETRIM":
      if (state.step !== "idle") return { state, commits: [] };
      return {
        state: {
          step: "trim",
          target: action.target,
          source: "retrim",
          current: action.asset,
          editIndex: action.index,
        },
        commits: [],
      };

    default:
      return { state, commits: [] };
  }
}

export function isMediaFlowBusy(state: ExploreMediaFlowState): boolean {
  return state.step !== "idle";
}

export function buildLibraryBatchFromPicks(ordered: PickedAsset[]): {
  batch: LibraryBatchSlot[];
  firstVideo: PickedAsset | null;
} {
  const batch: LibraryBatchSlot[] = ordered.map((asset) =>
    isVideoAsset(asset) ? { kind: "video", asset } : { kind: "image", asset },
  );
  const firstVideoSlot = batch.find((s) => s.kind === "video" && s.resolved === undefined);
  const firstVideo = firstVideoSlot?.kind === "video" ? firstVideoSlot.asset : null;
  return { batch, firstVideo };
}

type TrimStepLike = Extract<ExploreMediaFlowState, { step: "trim" }>;

export function resolveTrimEditorStep(state: ExploreMediaFlowState): TrimStepLike | null {
  if (state.step === "trim") return state;
  if (state.step === "hidingTrim") {
    const ui = state.trimUi;
    return {
      step: "trim",
      target: ui.target,
      source: ui.source,
      current: ui.current,
      libraryBatch: ui.libraryBatch,
      editIndex: ui.editIndex,
      retakeFacing: ui.retakeFacing,
    };
  }
  return null;
}

export function libraryTrimQueueLabel(state: ExploreMediaFlowState): { index: number; total: number } | null {
  const trim = resolveTrimEditorStep(state);
  if (!trim || trim.source !== "library" || !trim.libraryBatch) return null;
  const libraryBatch = trim.libraryBatch;
  const videos = libraryBatch.filter((s) => s.kind === "video");
  const total = videos.length;
  if (total <= 1) return null;
  const resolvedCount = videos.filter((s) => s.resolved !== undefined).length;
  return { index: resolvedCount + 1, total };
}
