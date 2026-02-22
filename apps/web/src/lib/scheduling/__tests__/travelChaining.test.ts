/**
 * Unit Tests for Travel Chaining Logic
 * 
 * Tests for Phase 3 travel chaining features:
 * - Route computation from previous/next appointments
 * - Travel override handling
 * - Virtual travel block generation
 * 
 * @module lib/scheduling/__tests__/travelChaining.test
 */

import { describe, it, expect } from "vitest";
import {
  getAppointmentLocation,
  computeTravelBetweenLocations,
  getStaffDayAppointments,
  computeChainedTravel,
  generateChainedTravelBlocks,
  createTravelOverride,
  serializeTravelOverride,
  deserializeTravelOverride,
  type LocationInfo,
  type TravelOverride,
} from "../travelChaining";
import type { Appointment } from "@/lib/provider-portal/types";
import type { Coordinates } from "@/lib/travel/travelFeeEngine";

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

const salonLocation: Coordinates = { latitude: -26.2041, longitude: 28.0473 }; // Johannesburg
const homeLocation1: Coordinates = { latitude: -26.1076, longitude: 28.0567 }; // Sandton
const homeLocation2: Coordinates = { latitude: -26.1496, longitude: 28.1113 }; // Midrand

const salonLocations = new Map<string, Coordinates>([
  ["salon-1", salonLocation],
]);

// ============================================================================
// LOCATION EXTRACTION TESTS
// ============================================================================

describe("getAppointmentLocation", () => {
  it("should return home location for at_home appointments", () => {
    const apt = createMockAppointment({
      location_type: "at_home",
      address_line1: "123 Main St",
      address_city: "Sandton",
      address_latitude: homeLocation1.latitude,
      address_longitude: homeLocation1.longitude,
    });

    const location = getAppointmentLocation(apt, salonLocations);
    
    expect(location.type).toBe("home");
    expect(location.coordinates).toEqual(homeLocation1);
    expect(location.address).toContain("123 Main St");
  });

  it("should return salon location for at_salon appointments", () => {
    const apt = createMockAppointment({
      location_type: "at_salon",
      location_id: "salon-1",
      location_name: "Main Salon",
    });

    const location = getAppointmentLocation(apt, salonLocations);
    
    expect(location.type).toBe("salon");
    expect(location.coordinates).toEqual(salonLocation);
    expect(location.locationId).toBe("salon-1");
  });

  it("should return unknown for appointments without location", () => {
    const apt = createMockAppointment();

    const location = getAppointmentLocation(apt, salonLocations);
    
    expect(location.type).toBe("unknown");
  });
});

// ============================================================================
// TRAVEL COMPUTATION TESTS
// ============================================================================

describe("computeTravelBetweenLocations", () => {
  it("should compute travel time between two locations with coordinates", () => {
    const from: LocationInfo = { type: "salon", coordinates: salonLocation };
    const to: LocationInfo = { type: "home", coordinates: homeLocation1 };

    const result = computeTravelBetweenLocations(from, to);
    
    expect(result.travelTimeMinutes).toBeGreaterThan(0);
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("should return zero travel time for same salon location", () => {
    const from: LocationInfo = { type: "salon", locationId: "salon-1" };
    const to: LocationInfo = { type: "salon", locationId: "salon-1" };

    const result = computeTravelBetweenLocations(from, to);
    
    expect(result.travelTimeMinutes).toBe(0);
  });

  it("should return base travel time when coordinates missing", () => {
    const from: LocationInfo = { type: "salon", locationId: "salon-1" };
    const to: LocationInfo = { type: "home", address: "123 Main St" };

    const result = computeTravelBetweenLocations(from, to, { baseTravelTimeMinutes: 45 });
    
    expect(result.travelTimeMinutes).toBe(45);
  });

  it("should use custom rules for travel calculation", () => {
    const from: LocationInfo = { type: "salon", coordinates: salonLocation };
    const to: LocationInfo = { type: "home", coordinates: homeLocation1 };

    const result = computeTravelBetweenLocations(from, to, {
      baseTravelTimeMinutes: 10,
      defaultMinutesPerKm: 5,
    });
    
    expect(result.travelTimeMinutes).toBeGreaterThan(10);
  });
});

// ============================================================================
// STAFF DAY APPOINTMENTS TESTS
// ============================================================================

describe("getStaffDayAppointments", () => {
  it("should filter and sort appointments for staff and date", () => {
    const appointments = [
      createMockAppointment({ id: "apt-1", scheduled_time: "14:00", team_member_id: "staff-1" }),
      createMockAppointment({ id: "apt-2", scheduled_time: "10:00", team_member_id: "staff-1" }),
      createMockAppointment({ id: "apt-3", scheduled_time: "11:00", team_member_id: "staff-2" }),
      createMockAppointment({ id: "apt-4", scheduled_time: "12:00", team_member_id: "staff-1", status: "cancelled" }),
    ];

    const result = getStaffDayAppointments(appointments, "staff-1", "2024-01-15");
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("apt-2"); // 10:00 first
    expect(result[1].id).toBe("apt-1"); // 14:00 second
  });

  it("should exclude cancelled and no-show appointments", () => {
    const appointments = [
      createMockAppointment({ id: "apt-1", status: "booked" }),
      createMockAppointment({ id: "apt-2", status: "cancelled" }),
      createMockAppointment({ id: "apt-3", status: "no_show" }),
    ];

    const result = getStaffDayAppointments(appointments, "staff-1", "2024-01-15");
    
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("apt-1");
  });
});

// ============================================================================
// CHAINED TRAVEL TESTS
// ============================================================================

describe("computeChainedTravel", () => {
  it("should compute travel from salon for first at_home appointment", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_home",
        scheduled_time: "10:00",
        address_latitude: homeLocation1.latitude,
        address_longitude: homeLocation1.longitude,
      }),
    ];

    const results = computeChainedTravel(
      appointments,
      salonLocations,
      "salon-1",
      new Map()
    );
    
    expect(results).toHaveLength(1);
    expect(results[0].preTravelMinutes).toBeGreaterThan(0);
    expect(results[0].postTravelMinutes).toBeGreaterThan(0);
  });

  it("should compute travel between consecutive at_home appointments", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_home",
        scheduled_time: "10:00",
        duration_minutes: 60,
        address_latitude: homeLocation1.latitude,
        address_longitude: homeLocation1.longitude,
      }),
      createMockAppointment({
        id: "apt-2",
        location_type: "at_home",
        scheduled_time: "12:00",
        address_latitude: homeLocation2.latitude,
        address_longitude: homeLocation2.longitude,
      }),
    ];

    const results = computeChainedTravel(
      appointments,
      salonLocations,
      "salon-1",
      new Map()
    );
    
    expect(results).toHaveLength(2);
    // Second appointment's pre-travel should be from first appointment's location
    expect(results[1].preTravelSegment?.fromLocation.type).toBe("home");
  });

  it("should use override values when provided", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_home",
        scheduled_time: "10:00",
        travel_fee: 100,
      }),
    ];

    const overrides = new Map<string, TravelOverride>([
      ["apt-1", {
        appointmentId: "apt-1",
        overrideTravelMinutes: 45,
        overrideTravelFee: 75,
        reason: "Client lives nearby",
      }],
    ]);

    const results = computeChainedTravel(
      appointments,
      salonLocations,
      "salon-1",
      overrides
    );
    
    expect(results[0].preTravelMinutes).toBe(45);
    expect(results[0].totalTravelFee).toBe(75);
    expect(results[0].isOverridden).toBe(true);
  });

  it("should skip in-salon appointments", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_salon",
        scheduled_time: "10:00",
      }),
      createMockAppointment({
        id: "apt-2",
        location_type: "at_home",
        scheduled_time: "14:00",
      }),
    ];

    const results = computeChainedTravel(
      appointments,
      salonLocations,
      "salon-1",
      new Map()
    );
    
    expect(results).toHaveLength(1);
    expect(results[0].appointmentId).toBe("apt-2");
  });
});

// ============================================================================
// TRAVEL BLOCK GENERATION TESTS
// ============================================================================

describe("generateChainedTravelBlocks", () => {
  it("should generate pre and post travel blocks", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_home",
        scheduled_time: "10:00",
        duration_minutes: 60,
      }),
    ];

    const blocks = generateChainedTravelBlocks(
      appointments,
      "staff-1",
      "2024-01-15",
      salonLocations,
      "salon-1",
      new Map()
    );
    
    expect(blocks.some(b => b.type === "pre")).toBe(true);
    expect(blocks.some(b => b.type === "post")).toBe(true);
  });

  it("should include client name in travel blocks", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        client_name: "Alice Smith",
        location_type: "at_home",
        scheduled_time: "10:00",
      }),
    ];

    const blocks = generateChainedTravelBlocks(
      appointments,
      "staff-1",
      "2024-01-15",
      salonLocations,
      "salon-1",
      new Map()
    );
    
    expect(blocks.every(b => b.clientName === "Alice Smith")).toBe(true);
  });

  it("should mark overridden blocks", () => {
    const appointments = [
      createMockAppointment({
        id: "apt-1",
        location_type: "at_home",
        scheduled_time: "10:00",
      }),
    ];

    const overrides = new Map<string, TravelOverride>([
      ["apt-1", {
        appointmentId: "apt-1",
        overrideTravelMinutes: 20,
      }],
    ]);

    const blocks = generateChainedTravelBlocks(
      appointments,
      "staff-1",
      "2024-01-15",
      salonLocations,
      "salon-1",
      overrides
    );
    
    const preBlock = blocks.find(b => b.type === "pre");
    expect(preBlock?.isOverridden).toBe(true);
  });
});

// ============================================================================
// OVERRIDE SERIALIZATION TESTS
// ============================================================================

describe("Travel Override Serialization", () => {
  it("should create override with all fields", () => {
    const override = createTravelOverride(
      "apt-1",
      { travelMinutes: 30, travelFee: 50, reason: "Test reason" },
      "user-123"
    );

    expect(override.appointmentId).toBe("apt-1");
    expect(override.overrideTravelMinutes).toBe(30);
    expect(override.overrideTravelFee).toBe(50);
    expect(override.reason).toBe("Test reason");
    expect(override.overriddenBy).toBe("user-123");
    expect(override.overriddenAt).toBeDefined();
  });

  it("should serialize and deserialize override", () => {
    const original: TravelOverride = {
      appointmentId: "apt-1",
      overrideTravelMinutes: 45,
      overrideTravelFee: 75,
      reason: "Client is close by",
      overriddenBy: "user-123",
      overriddenAt: "2024-01-15T10:00:00Z",
    };

    const serialized = serializeTravelOverride(original);
    const deserialized = deserializeTravelOverride(serialized);

    expect(deserialized).toEqual(original);
  });

  it("should return null for invalid JSON", () => {
    const result = deserializeTravelOverride("invalid json");
    expect(result).toBeNull();
  });
});
