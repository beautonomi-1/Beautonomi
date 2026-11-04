import { exploreMediaFlowReducer } from "@/features/explore/exploreMediaFlow";

describe("exploreMediaFlowReducer", () => {
  it("opens camera after draft hidden", () => {
    let state = exploreMediaFlowReducer({ step: "idle" }, { type: "OPEN_CAMERA", target: "create" }).state;
    state = exploreMediaFlowReducer(state, { type: "DRAFT_HIDDEN" }).state;
    expect(state.step).toBe("camera");
  });

  it("commits photo after camera hidden", () => {
    let state = exploreMediaFlowReducer(
      { step: "hidingCamera", target: "create", capture: null },
      { type: "CAMERA_HIDDEN" },
    ).state;
    expect(state.step).toBe("idle");

    const result = exploreMediaFlowReducer(
      {
        step: "hidingCamera",
        target: "create",
        capture: {
          uri: "file:///p.jpg",
          mimeType: "image/jpeg",
          fileName: "p.jpg",
          isVideo: false,
        },
      },
      { type: "CAMERA_HIDDEN" },
    );
    expect(result.state.step).toBe("idle");
    expect(result.commits[0]?.type).toBe("appendOne");
  });

  it("opens trim for camera video", () => {
    const result = exploreMediaFlowReducer(
      {
        step: "hidingCamera",
        target: "create",
        capture: {
          uri: "file:///v.mp4",
          mimeType: "video/mp4",
          fileName: "v.mp4",
          isVideo: true,
        },
      },
      { type: "CAMERA_HIDDEN" },
    );
    expect(result.state.step).toBe("trim");
  });

  it("retake from camera trim reopens camera in video mode", () => {
    const trimState = {
      step: "trim" as const,
      target: "create" as const,
      source: "camera" as const,
      current: {
        uri: "file:///v.mp4",
        mimeType: "video/mp4",
        isVideo: true,
      },
    };
    const cancelled = exploreMediaFlowReducer(trimState, { type: "TRIM_CANCEL" });
    expect(cancelled.state.step).toBe("hidingTrim");
    expect(cancelled.commits).toHaveLength(0);
    if (cancelled.state.step === "hidingTrim") {
      const afterHide = exploreMediaFlowReducer(cancelled.state, { type: "TRIM_HIDDEN" });
      expect(afterHide.state.step).toBe("camera");
      if (afterHide.state.step === "camera") {
        expect(afterHide.state.initialMode).toBe("video");
      }
    }
  });

  it("ignores draft hidden when not hiding draft", () => {
    const result = exploreMediaFlowReducer({ step: "idle" }, { type: "DRAFT_HIDDEN" });
    expect(result.state.step).toBe("idle");
  });

  it("library batch commits images and trimmed videos in pick order", () => {
    const batch = [
      { kind: "image" as const, asset: { uri: "file:///a.jpg", isVideo: false } },
      {
        kind: "video" as const,
        asset: { uri: "file:///v1.mp4", isVideo: true, mimeType: "video/mp4" },
      },
      { kind: "image" as const, asset: { uri: "file:///b.jpg", isVideo: false } },
    ];
    let state = exploreMediaFlowReducer(
      { step: "picking", target: "create" },
      { type: "LIBRARY_PICKED", batch, firstVideo: batch[1]!.asset },
    ).state;
    expect(state.step).toBe("trim");

    const trimmed1 = {
      uri: "file:///v1.mp4",
      isVideo: true,
      mimeType: "video/mp4",
      trim_start_ms: 0,
      trim_end_ms: 5000,
      source_duration_ms: 10_000,
      duration_ms: 5000,
    };
    const afterFirst = exploreMediaFlowReducer(state, {
      type: "TRIM_CONFIRM",
      trim: { trim_start_ms: 0, trim_end_ms: 5000 },
      sourceDurationMs: 10_000,
    });
    expect(afterFirst.state.step).toBe("hidingTrim");
    expect(afterFirst.commits).toHaveLength(0);
    const afterHide = exploreMediaFlowReducer(afterFirst.state, { type: "TRIM_HIDDEN" });
    expect(afterHide.state.step).toBe("idle");
    expect(afterHide.commits[0]?.type).toBe("append");
    if (afterHide.commits[0]?.type === "append") {
      expect(afterHide.commits[0].assets.map((a) => a.uri)).toEqual([
        "file:///a.jpg",
        "file:///v1.mp4",
        "file:///b.jpg",
      ]);
    }
  });

  it("skipping library trim drops that video but keeps images", () => {
    const batch = [
      { kind: "image" as const, asset: { uri: "file:///a.jpg", isVideo: false } },
      {
        kind: "video" as const,
        asset: { uri: "file:///v1.mp4", isVideo: true, mimeType: "video/mp4" },
      },
    ];
    let state = exploreMediaFlowReducer(
      { step: "picking", target: "create" },
      { type: "LIBRARY_PICKED", batch, firstVideo: batch[1]!.asset },
    ).state;
    const cancelled = exploreMediaFlowReducer(state, { type: "TRIM_CANCEL" });
    expect(cancelled.state.step).toBe("hidingTrim");
    const afterHide = exploreMediaFlowReducer(cancelled.state, { type: "TRIM_HIDDEN" });
    expect(afterHide.state.step).toBe("idle");
    expect(afterHide.commits[0]?.type).toBe("append");
    if (afterHide.commits[0]?.type === "append") {
      expect(afterHide.commits[0].assets.map((a) => a.uri)).toEqual(["file:///a.jpg"]);
    }
  });
});
