import { describe, expect, it } from "vitest";
import { assignGroupServiceOwners, detectPrimaryInGroupParticipants } from "../assign-group-service-owners";

describe("assignGroupServiceOwners", () => {
  it("tags primary-only draft lines with the primary participant id", () => {
    const result = assignGroupServiceOwners({
      draftServices: [{ offering_id: "svc-a", staff_id: "staff-1" }],
      groupParticipants: [{ name: "Guest", service_ids: ["svc-b"] }],
      primaryContactName: "Alex",
    });
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0]?.isPrimary).toBe(true);
    expect(result.assignedLines[0]?.group_participant_id).toBe(result.participants[0]?.id);
    expect(result.assignedLines[0]?.guest_name).toBeNull();
  });

  it("detects when web included primary in group_participants[0]", () => {
    const primaryIn = detectPrimaryInGroupParticipants(["svc-a"], [
      { service_ids: ["svc-a"] },
      { service_ids: ["svc-b"] },
    ]);
    expect(primaryIn).toBe(true);
  });

  it("keeps every hold-consume guest when the client says the list is guests only", () => {
    // Hold consume flattens guest lines into draft.services, so the subset heuristic alone
    // would mistake the first guest for the primary booker.
    const result = assignGroupServiceOwners({
      draftServices: [
        { offering_id: "svc-a", staff_id: null },
        { offering_id: "svc-b", staff_id: null },
        { offering_id: "svc-c", staff_id: null },
      ],
      groupParticipants: [
        { name: "Ama", service_ids: ["svc-b"] },
        { name: "Lebo", service_ids: ["svc-c"] },
      ],
      primaryContactName: "Alex",
      includesPrimary: false,
    });
    expect(result.participants.map((p) => [p.name, p.isPrimary])).toEqual([
      ["Alex", true],
      ["Ama", false],
      ["Lebo", false],
    ]);
    const ownerName = (offeringId: string) => {
      const line = result.assignedLines.find((l) => l.offering_id === offeringId);
      return result.participants.find((p) => p.id === line?.group_participant_id)?.name;
    };
    expect(ownerName("svc-a")).toBe("Alex");
    expect(ownerName("svc-b")).toBe("Ama");
    expect(ownerName("svc-c")).toBe("Lebo");
  });

  it("honours an explicit includesPrimary flag over the heuristic", () => {
    expect(
      detectPrimaryInGroupParticipants(["svc-a", "svc-b"], [{ service_ids: ["svc-b"] }], false),
    ).toBe(false);
    expect(
      detectPrimaryInGroupParticipants(["svc-a"], [{ service_ids: [] }, { service_ids: ["svc-a"] }], true),
    ).toBe(true);
  });
});
