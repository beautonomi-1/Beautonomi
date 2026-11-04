import { useCallback, useMemo, useReducer, useRef } from "react";
import { Alert } from "react-native";
import {
  buildLibraryBatchFromPicks,
  exploreMediaFlowReducer,
  type CameraCapturePayload,
  type ExploreMediaFlowState,
  type MediaFlowCommit,
  type MediaFlowTarget,
  isMediaFlowBusy,
} from "@/features/explore/exploreMediaFlow";
import type { PickedAsset, ExploreUploadCaps } from "@/lib/explore-picked-asset";
import { validatePickedAssetForExplore } from "@/lib/explore-picked-asset";
import { launchImageLibraryWithPermission } from "@/lib/native-permissions";
import { PERMISSION_COPY } from "@/lib/native-permissions";
import { mapCameraCaptureToAsset, mapPickerAsset } from "@/lib/explore-picked-asset";

type Options = {
  caps: ExploreUploadCaps;
  videoUploadEnabled?: boolean;
  ep: (key: string, opts?: Record<string, unknown>) => string;
  slotsLeft: (target: MediaFlowTarget) => number;
  onCommit: (commit: MediaFlowCommit) => void;
};

function applyCommits(commits: MediaFlowCommit[], onCommit: (c: MediaFlowCommit) => void) {
  for (const c of commits) onCommit(c);
}

export function useExploreMediaFlow({
  caps,
  videoUploadEnabled = true,
  ep,
  slotsLeft,
  onCommit,
}: Options) {
  const [state, dispatchBase] = useReducer(
    (s: ExploreMediaFlowState, action: Parameters<typeof exploreMediaFlowReducer>[1]) => {
      const result = exploreMediaFlowReducer(s, action);
      if (result.commits.length) {
        queueMicrotask(() => applyCommits(result.commits, onCommit));
      }
      return result.state;
    },
    { step: "idle" } as ExploreMediaFlowState,
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const libraryPickInFlightRef = useRef(false);

  const dispatch = dispatchBase;

  const onDraftHidden = useCallback(() => {
    if (stateRef.current.step === "hidingDraft") {
      dispatch({ type: "DRAFT_HIDDEN" });
    }
  }, []);

  const onCameraHidden = useCallback(() => {
    if (stateRef.current.step === "hidingCamera") {
      dispatch({ type: "CAMERA_HIDDEN" });
    }
  }, []);

  const onTrimHidden = useCallback(() => {
    if (stateRef.current.step === "hidingTrim") {
      dispatch({ type: "TRIM_HIDDEN" });
    }
  }, []);

  const openCamera = useCallback(
    (target: MediaFlowTarget) => {
      if (isMediaFlowBusy(stateRef.current)) {
        Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
        return;
      }
      if (slotsLeft(target) <= 0) return;
      dispatch({ type: "OPEN_CAMERA", target });
    },
    [ep, slotsLeft],
  );

  const openLibrary = useCallback(
    (target: MediaFlowTarget) => {
      if (isMediaFlowBusy(stateRef.current)) {
        Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
        return;
      }
      if (slotsLeft(target) <= 0) return;
      dispatch({ type: "OPEN_LIBRARY", target });
    },
    [ep, slotsLeft],
  );

  const runLibraryPick = useCallback(async () => {
    if (libraryPickInFlightRef.current) return;
    const current = stateRef.current;
    if (current.step !== "picking") return;
    libraryPickInFlightRef.current = true;
    try {
      const target = current.target;
      const room = slotsLeft(target);
      if (room <= 0) {
        dispatch({ type: "PICK_CANCELLED" });
        return;
      }
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: videoUploadEnabled ? ["images", "videos"] : ["images"],
          allowsMultipleSelection: true,
          quality: 0.9,
        },
        PERMISSION_COPY.photosPost,
      );
      if (stateRef.current.step !== "picking") return;
      if (!result || result.canceled) {
        dispatch({ type: "PICK_CANCELLED" });
        return;
      }
      const mapped = result.assets.slice(0, room).map((a) => mapPickerAsset(a));
      let skipped = 0;
      const accepted: PickedAsset[] = [];
      for (const asset of mapped) {
        const v = await validatePickedAssetForExplore(asset, caps);
        if (!v.ok) {
          skipped += 1;
          continue;
        }
        accepted.push(asset);
      }
      if (skipped > 0) {
        Alert.alert(ep("uploadFailedTitle"), ep("mediaSkippedTooLarge", { count: skipped }));
      }
      if (accepted.length === 0) {
        dispatch({ type: "PICK_CANCELLED" });
        return;
      }
      const { batch, firstVideo } = buildLibraryBatchFromPicks(accepted);
      dispatch({ type: "LIBRARY_PICKED", batch, firstVideo });
    } finally {
      libraryPickInFlightRef.current = false;
    }
  }, [caps, ep, slotsLeft, videoUploadEnabled]);

  const onCaptured = useCallback(
    async (capture: CameraCapturePayload): Promise<boolean> => {
      const v = await validatePickedAssetForExplore(mapCameraCaptureToAsset(capture), caps);
      if (!v.ok) {
        Alert.alert(ep("uploadFailedTitle"), ep("mediaSkippedTooLarge", { count: 1 }));
        return false;
      }
      dispatch({ type: "CAPTURED", capture });
      return true;
    },
    [caps, ep],
  );

  const closeCamera = useCallback(() => {
    dispatch({ type: "CAMERA_CLOSED" });
  }, []);

  const resetFlow = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const retrim = useCallback(
    (target: MediaFlowTarget, index: number, asset: PickedAsset) => {
      if (isMediaFlowBusy(stateRef.current)) return;
      dispatch({ type: "RETRIM", target, index, asset });
    },
    [],
  );

  return useMemo(
    () => ({
      state,
      dispatch,
      isBusy: isMediaFlowBusy(state),
      onDraftHidden,
      onCameraHidden,
      onTrimHidden,
      openCamera,
      openLibrary,
      runLibraryPick,
      onCaptured,
      closeCamera,
      resetFlow,
      retrim,
    }),
    [
      state,
      onDraftHidden,
      onCameraHidden,
      onTrimHidden,
      openCamera,
      openLibrary,
      runLibraryPick,
      onCaptured,
      closeCamera,
      resetFlow,
      retrim,
    ],
  );
}
