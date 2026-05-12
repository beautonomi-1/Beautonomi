import {
  buildProviderBookingActionModel,
  mapProviderBookingActionError,
} from "@/lib/provider-booking-action-policy";

describe("buildProviderBookingActionModel", () => {
  it("enables confirm for paid-but-pending bookings and explains payment lifecycle separation", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-1",
      db_status: "pending",
      payment_status: "paid",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.label).toBe("Confirm");
    expect(model.primaryListAction?.dbTarget).toBe("confirmed");
    expect(model.paymentLifecycleNote).toMatch(/Payment received/);
  });

  it("treats stuck pending_payment + paid as effective pending and exposes confirm/check_in/cancel", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-stuck",
      db_status: "pending_payment",
      payment_status: "paid",
      scheduled_at: new Date().toISOString(),
    });

    // Status targets must include the full pending-graph (confirmed, checked_in, cancelled),
    // not the cancel-only graph that pending_payment normally gets.
    expect(model.statusTargets).toEqual(expect.arrayContaining(["confirmed", "cancelled"]));
    expect(model.statusTargets).not.toEqual(["cancelled"]);
    expect(model.primaryListAction?.label).toBe("Confirm");
    expect(model.paymentLifecycleNote).toMatch(/Payment received/);
    expect(model.currentDbStatus).toBe("pending");
  });

  it("keeps pending_payment + unpaid in the cancel-only graph with a verification message", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-3",
      db_status: "pending_payment",
      payment_status: "pending",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.statusTargets).toEqual(["cancelled"]);
    expect(model.disabledReasons.join(" ")).toMatch(/Payment is still being verified/);
  });

  it("blocks at-home start service until arrival is verified", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-2",
      db_status: "checked_in",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_pending: true,
      arrival_otp_verified: false,
      qr_code_verified: false,
    });

    expect(model.statusTargets).not.toContain("in_progress");
    expect(model.disabledReasons[0]).toMatch(/PIN or QR/);
  });

  it("maps structured backend errors into provider-facing copy", () => {
    expect(mapProviderBookingActionError("raw", "CONFLICT")).toMatch(/updated elsewhere/);
    expect(mapProviderBookingActionError(null, "VERIFICATION_NOT_COMPLETE")).toMatch(/PIN or QR/);
  });
});

describe("buildProviderBookingActionModel: at-home vs at-salon flow gating", () => {
  it("does NOT show check_in or waiting in the status picker for at-home + confirmed", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-1",
      db_status: "confirmed",
      location_type: "at_home",
      current_stage: null,
      scheduled_at: new Date().toISOString(),
    });

    expect(model.statusTargets).not.toContain("checked_in");
    expect(model.statusTargets).not.toContain("waiting");
  });

  it("DOES show check_in / waiting for at-salon + confirmed (regression guard)", () => {
    const model = buildProviderBookingActionModel({
      id: "salon-1",
      db_status: "confirmed",
      location_type: "at_salon",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.statusTargets).toEqual(expect.arrayContaining(["checked_in"]));
  });

  it("treats at-home + confirmed + today as Start Journey for the primary list action", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-2",
      db_status: "confirmed",
      location_type: "at_home",
      current_stage: null,
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.id).toBe("start_journey");
    expect(model.primaryListAction?.kind).toBe("post-action");
    expect(model.primaryListAction?.route).toMatch(/start-journey/);
  });

  it("upgrades the primary list action to Mark arrived once en route", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-3",
      db_status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_on_way",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.id).toBe("mark_arrived");
    expect(model.actions.find((a) => a.id === "start_journey")).toBeUndefined();
  });

  it("upgrades the primary list action to Start service once arrived + verified", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-4",
      db_status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_verified: true,
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.id).toBe("start_service");
  });

  it("keeps at-salon + today + confirmed primary action as Check in (no Start journey)", () => {
    const model = buildProviderBookingActionModel({
      id: "salon-2",
      db_status: "confirmed",
      location_type: "at_salon",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.id).toBe("check_in");
    expect(model.actions.find((a) => a.id === "start_journey")).toBeUndefined();
    expect(model.actions.find((a) => a.id === "mark_arrived")).toBeUndefined();
  });

  it("opens a Reset to confirmed recovery action when an at-home booking is stuck in checked_in", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-stuck",
      db_status: "checked_in",
      location_type: "at_home",
      current_stage: null,
      scheduled_at: new Date().toISOString(),
    });

    const reset = model.actions.find((a) => a.id === "reset_to_confirmed");
    expect(reset).toBeDefined();
    expect(reset?.dbTarget).toBe("confirmed");
    expect(reset?.kind).toBe("patch-status");
    expect(model.statusTargets).toContain("confirmed");
    expect(model.disabledReasons.join(" ")).toMatch(/salon-only status/);
    expect(model.primaryListAction?.id).toBe("reset_to_confirmed");
  });

  it("removes salon-only states even when address is provided but location_type is missing (implicit at-home)", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-implicit",
      db_status: "confirmed",
      location_type: null,
      location_id: null,
      address: { line1: "1 Long St" },
      current_stage: null,
      scheduled_at: new Date().toISOString(),
    });

    expect(model.statusTargets).not.toContain("checked_in");
    expect(model.statusTargets).not.toContain("waiting");
    expect(model.actions.find((a) => a.id === "start_journey")).toBeDefined();
  });

  it("offers Mark no-show / Cancel only on the at-home picker for confirmed bookings (no salon options)", () => {
    const model = buildProviderBookingActionModel({
      id: "athome-options",
      db_status: "confirmed",
      location_type: "at_home",
      current_stage: null,
      scheduled_at: new Date().toISOString(),
    });

    expect(model.statusTargets).toEqual(expect.arrayContaining(["cancelled", "no_show"]));
    expect(model.statusTargets).not.toContain("checked_in");
    expect(model.statusTargets).not.toContain("waiting");
  });
});
