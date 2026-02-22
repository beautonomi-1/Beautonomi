/**
 * Unit Tests for Mangomint Adapter
 * 
 * Tests for the adapter layer including:
 * - canPlace() conflict detection
 * - Status mapping
 * - Time utilities
 * - Travel block generation
 * 
 * @module lib/scheduling/__tests__/mangomintAdapter.test
 */

import { describe, it, expect } from "vitest";
import {
  canPlace,
  overlaps,
  snapToIncrement,
  timeToMinutes,
  minutesToTime,
  mapStatus,
  unmapStatus,
  mapKind,
  toMangomintAppointment,
  generateTravelBlocks,
  AppointmentStatus,
  AppointmentKind,
  BlockKind,
  type MangomintAppointment,
  type MangomintBlock,
} from "../mangomintAdapter";
import type { Appointment, TimeBlock } from "@/lib/provider-portal/types";

// ============================================================================
// TEST DATA
// ============================================================================

const createMockAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "apt-1",
  ref_number: "APT001",
  client_name: "John Doe",
  service_id: "svc-1",
  service_name: "Haircut",
  team_member_id: "staff-1",
  team_member_name: "Jane Smith",
  scheduled_date: "2024-01-15",
  scheduled_time: "10:00",
  duration_minutes: 60,
  price: 150,
  status: "booked",
  created_by: "system",
  created_date: "2024-01-01",
  ...overrides,
});

const createMockMangomintAppointment = (
  overrides: Partial<MangomintAppointment> = {}
): MangomintAppointment => ({
  id: "apt-1",
  refNumber: "APT001",
  startTimeUtc: new Date("2024-01-15T10:00:00"),
  endTimeUtc: new Date("2024-01-15T11:00:00"),
  startTimeLocal: "10:00",
  endTimeLocal: "11:00",
  durationMinutes: 60,
  staffId: "staff-1",
  staffName: "Jane Smith",
  locationId: null,
  locationName: null,
  clientId: null,
  clientName: "John Doe",
  clientEmail: null,
  clientPhone: null,
  serviceName: "Haircut",
  serviceId: "svc-1",
  price: 150,
  status: AppointmentStatus.CONFIRMED,
  kind: AppointmentKind.IN_SALON,
  segments: [],
  iconFlags: {
    isNewClient: false,
    hasNotes: false,
    isRepeating: false,
    hasMembership: false,
    hasFormsIncomplete: false,
    hasPhotos: false,
    hasConversation: false,
    isGroup: false,
    requestedProvider: false,
    requestedGender: null,
    hasCustomization: false,
    isWalkIn: false,
    isAtHome: false,
  },
  address: null,
  travelFee: null,
  travelTimeMinutes: null,
  _original: createMockAppointment(),
  ...overrides,
});

const createMockTimeBlock = (overrides: Partial<TimeBlock> = {}): TimeBlock => ({
  id: "block-1",
  name: "Lunch Break",
  team_member_id: "staff-1",
  date: "2024-01-15",
  start_time: "12:00",
  end_time: "13:00",
  is_recurring: false,
  is_active: true,
  created_date: "2024-01-01",
  ...overrides,
});

const createMockMangomintBlock = (overrides: Partial<MangomintBlock> = {}): MangomintBlock => ({
  id: "block-1",
  kind: BlockKind.TIME_BLOCK,
  staffId: "staff-1",
  startTime: "12:00",
  endTime: "13:00",
  durationMinutes: 60,
  name: "Lunch Break",
  _original: createMockTimeBlock(),
  ...overrides,
});

// ============================================================================
// TIME UTILITY TESTS
// ============================================================================

describe("Time Utilities", () => {
  describe("timeToMinutes", () => {
    it("should convert time string to minutes", () => {
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("01:00")).toBe(60);
      expect(timeToMinutes("10:30")).toBe(630);
      expect(timeToMinutes("23:59")).toBe(1439);
    });
  });

  describe("minutesToTime", () => {
    it("should convert minutes to time string", () => {
      expect(minutesToTime(0)).toBe("00:00");
      expect(minutesToTime(60)).toBe("01:00");
      expect(minutesToTime(630)).toBe("10:30");
      expect(minutesToTime(1439)).toBe("23:59");
    });
  });

  describe("snapToIncrement", () => {
    it("should snap to 15 minute increments", () => {
      expect(snapToIncrement("10:07", 15)).toBe("10:00");
      expect(snapToIncrement("10:08", 15)).toBe("10:15");
      expect(snapToIncrement("10:22", 15)).toBe("10:15");
      expect(snapToIncrement("10:23", 15)).toBe("10:30");
    });

    it("should snap to 5 minute increments", () => {
      expect(snapToIncrement("10:02", 5)).toBe("10:00");
      expect(snapToIncrement("10:03", 5)).toBe("10:05");
      expect(snapToIncrement("10:07", 5)).toBe("10:05");
      expect(snapToIncrement("10:08", 5)).toBe("10:10");
    });
  });
});

// ============================================================================
// OVERLAP DETECTION TESTS
// ============================================================================

describe("Overlap Detection", () => {
  describe("overlaps", () => {
    it("should detect overlapping intervals", () => {
      // Same start
      expect(overlaps("10:00", "11:00", "10:00", "11:00")).toBe(true);
      
      // Partial overlap
      expect(overlaps("10:00", "11:00", "10:30", "11:30")).toBe(true);
      expect(overlaps("10:30", "11:30", "10:00", "11:00")).toBe(true);
      
      // One inside another
      expect(overlaps("10:00", "12:00", "10:30", "11:30")).toBe(true);
      expect(overlaps("10:30", "11:30", "10:00", "12:00")).toBe(true);
    });

    it("should not detect non-overlapping intervals", () => {
      // Before
      expect(overlaps("08:00", "09:00", "10:00", "11:00")).toBe(false);
      
      // After
      expect(overlaps("12:00", "13:00", "10:00", "11:00")).toBe(false);
      
      // Adjacent (touching but not overlapping)
      expect(overlaps("09:00", "10:00", "10:00", "11:00")).toBe(false);
      expect(overlaps("10:00", "11:00", "11:00", "12:00")).toBe(false);
    });
  });
});

// ============================================================================
// CONFLICT DETECTION TESTS
// ============================================================================

describe("canPlace", () => {
  it("should allow placement in empty slot", () => {
    const result = canPlace(
      { startTime: "10:00", durationMinutes: 60, staffId: "staff-1" },
      { date: "2024-01-15", time: "10:00", staffId: "staff-1" },
      [],
      []
    );
    
    expect(result.valid).toBe(true);
    expect(result.conflictsWith).toBeUndefined();
  });

  it("should block placement overlapping with existing appointment", () => {
    const existing = createMockMangomintAppointment({
      startTimeLocal: "10:00",
      endTimeLocal: "11:00",
      staffId: "staff-1",
    });

    const result = canPlace(
      { startTime: "10:30", durationMinutes: 60, staffId: "staff-1" },
      { date: "2024-01-15", time: "10:30", staffId: "staff-1" },
      [existing],
      []
    );
    
    expect(result.valid).toBe(false);
    expect(result.conflictsWith).toContain("apt-1");
  });

  it("should block placement overlapping with time block", () => {
    const timeBlock = createMockMangomintBlock({
      startTime: "12:00",
      endTime: "13:00",
      staffId: "staff-1",
    });

    const result = canPlace(
      { startTime: "12:30", durationMinutes: 60, staffId: "staff-1" },
      { date: "2024-01-15", time: "12:30", staffId: "staff-1" },
      [],
      [timeBlock]
    );
    
    expect(result.valid).toBe(false);
    expect(result.conflictsWith).toContain("block:block-1");
  });

  it("should allow placement for different staff member", () => {
    const existing = createMockMangomintAppointment({
      startTimeLocal: "10:00",
      endTimeLocal: "11:00",
      staffId: "staff-1",
    });

    const result = canPlace(
      { startTime: "10:00", durationMinutes: 60, staffId: "staff-2" },
      { date: "2024-01-15", time: "10:00", staffId: "staff-2" },
      [existing],
      []
    );
    
    expect(result.valid).toBe(true);
  });

  it("should allow placement adjacent to existing appointment", () => {
    const existing = createMockMangomintAppointment({
      startTimeLocal: "10:00",
      endTimeLocal: "11:00",
      staffId: "staff-1",
    });

    const result = canPlace(
      { startTime: "11:00", durationMinutes: 60, staffId: "staff-1" },
      { date: "2024-01-15", time: "11:00", staffId: "staff-1" },
      [existing],
      []
    );
    
    expect(result.valid).toBe(true);
  });

  it("should skip self when checking conflicts", () => {
    const existing = createMockMangomintAppointment({
      id: "apt-1",
      startTimeLocal: "10:00",
      endTimeLocal: "11:00",
      staffId: "staff-1",
    });

    const result = canPlace(
      { ...existing },
      { date: "2024-01-15", time: "10:00", staffId: "staff-1" },
      [existing],
      []
    );
    
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// STATUS MAPPING TESTS
// ============================================================================

describe("Status Mapping", () => {
  describe("mapStatus", () => {
    it("should map pending to UNCONFIRMED", () => {
      expect(mapStatus("pending")).toBe(AppointmentStatus.UNCONFIRMED);
    });

    it("should map booked to CONFIRMED", () => {
      expect(mapStatus("booked")).toBe(AppointmentStatus.CONFIRMED);
    });

    it("should map started to IN_SERVICE", () => {
      expect(mapStatus("started")).toBe(AppointmentStatus.IN_SERVICE);
    });

    it("should map completed to COMPLETED", () => {
      expect(mapStatus("completed")).toBe(AppointmentStatus.COMPLETED);
    });

    it("should map cancelled to CANCELED", () => {
      expect(mapStatus("cancelled")).toBe(AppointmentStatus.CANCELED);
    });

    it("should map no_show to NO_SHOW", () => {
      expect(mapStatus("no_show")).toBe(AppointmentStatus.NO_SHOW);
    });
  });

  describe("unmapStatus", () => {
    it("should unmap UNCONFIRMED to pending", () => {
      expect(unmapStatus(AppointmentStatus.UNCONFIRMED)).toBe("pending");
    });

    it("should unmap CONFIRMED to booked", () => {
      expect(unmapStatus(AppointmentStatus.CONFIRMED)).toBe("booked");
    });

    it("should unmap IN_SERVICE to started", () => {
      expect(unmapStatus(AppointmentStatus.IN_SERVICE)).toBe("started");
    });

    it("should unmap COMPLETED to completed", () => {
      expect(unmapStatus(AppointmentStatus.COMPLETED)).toBe("completed");
    });

    it("should unmap CANCELED to cancelled", () => {
      expect(unmapStatus(AppointmentStatus.CANCELED)).toBe("cancelled");
    });
  });
});

// ============================================================================
// KIND MAPPING TESTS
// ============================================================================

describe("Kind Mapping", () => {
  describe("mapKind", () => {
    it("should map at_home to AT_HOME", () => {
      const apt = createMockAppointment({ location_type: "at_home" });
      expect(mapKind(apt)).toBe(AppointmentKind.AT_HOME);
    });

    it("should map at_salon to IN_SALON", () => {
      const apt = createMockAppointment({ location_type: "at_salon" });
      expect(mapKind(apt)).toBe(AppointmentKind.IN_SALON);
    });

    it("should default to IN_SALON", () => {
      const apt = createMockAppointment();
      expect(mapKind(apt)).toBe(AppointmentKind.IN_SALON);
    });
  });
});

// ============================================================================
// TRAVEL BLOCK GENERATION TESTS
// ============================================================================

describe("Travel Block Generation", () => {
  describe("generateTravelBlocks", () => {
    it("should generate travel blocks for at-home appointments", () => {
      const apt = createMockMangomintAppointment({
        kind: AppointmentKind.AT_HOME,
        startTimeLocal: "10:00",
        endTimeLocal: "11:00",
        staffId: "staff-1",
      });

      const blocks = generateTravelBlocks(apt, 30);
      
      expect(blocks).toHaveLength(2);
      
      // Pre-travel block
      expect(blocks[0].kind).toBe(BlockKind.TRAVEL_BLOCK);
      expect(blocks[0].startTime).toBe("09:30");
      expect(blocks[0].endTime).toBe("10:00");
      expect(blocks[0].staffId).toBe("staff-1");
      
      // Post-travel block
      expect(blocks[1].kind).toBe(BlockKind.TRAVEL_BLOCK);
      expect(blocks[1].startTime).toBe("11:00");
      expect(blocks[1].endTime).toBe("11:30");
    });

    it("should not generate travel blocks for in-salon appointments", () => {
      const apt = createMockMangomintAppointment({
        kind: AppointmentKind.IN_SALON,
      });

      const blocks = generateTravelBlocks(apt, 30);
      
      expect(blocks).toHaveLength(0);
    });

    it("should not generate travel blocks for zero travel time", () => {
      const apt = createMockMangomintAppointment({
        kind: AppointmentKind.AT_HOME,
      });

      const blocks = generateTravelBlocks(apt, 0);
      
      expect(blocks).toHaveLength(0);
    });
  });
});

// ============================================================================
// APPOINTMENT CONVERSION TESTS
// ============================================================================

describe("Appointment Conversion", () => {
  describe("toMangomintAppointment", () => {
    it("should convert basic appointment", () => {
      const apt = createMockAppointment();
      const result = toMangomintAppointment(apt);
      
      expect(result.id).toBe("apt-1");
      expect(result.clientName).toBe("John Doe");
      expect(result.serviceName).toBe("Haircut");
      expect(result.staffId).toBe("staff-1");
      expect(result.startTimeLocal).toBe("10:00");
      expect(result.durationMinutes).toBe(60);
      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
      expect(result.kind).toBe(AppointmentKind.IN_SALON);
    });

    it("should convert at-home appointment with address", () => {
      const apt = createMockAppointment({
        location_type: "at_home",
        address_line1: "123 Main St",
        address_city: "Cape Town",
        address_postal_code: "8000",
        travel_fee: 100,
      });
      const result = toMangomintAppointment(apt);
      
      expect(result.kind).toBe(AppointmentKind.AT_HOME);
      expect(result.address).toBe("123 Main St, Cape Town, 8000");
      expect(result.travelFee).toBe(100);
      expect(result.iconFlags.isAtHome).toBe(true);
    });

    it("should set icon flags correctly", () => {
      const apt = createMockAppointment({
        notes: "Some notes",
        is_group_booking: true,
      });
      const result = toMangomintAppointment(apt);
      
      expect(result.iconFlags.hasNotes).toBe(true);
      expect(result.iconFlags.isGroup).toBe(true);
    });

    it("should preserve original appointment", () => {
      const apt = createMockAppointment();
      const result = toMangomintAppointment(apt);
      
      expect(result._original).toBe(apt);
    });
  });
});
