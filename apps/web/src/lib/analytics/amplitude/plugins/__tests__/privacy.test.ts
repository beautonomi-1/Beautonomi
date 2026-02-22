/**
 * Privacy Plugin Tests
 */

import { PrivacyPlugin } from "../privacy";
import { PluginContext } from "../types";
import { AmplitudeEvent } from "../../types";

describe("PrivacyPlugin", () => {
  const createContext = (debugMode = false): PluginContext => ({
    config: { debug_mode: debugMode },
  });

  it("should redact email from event properties", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      event_properties: {
        email: "test@example.com",
        name: "John Doe",
      },
    };

    const result = plugin.execute(event);

    expect(result.event_properties?.email).toBeUndefined();
    expect(result.event_properties?.name).toBe("John Doe");
  });

  it("should redact phone from event properties", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      event_properties: {
        phone: "+1234567890",
        phone_number: "+9876543210",
        name: "John Doe",
      },
    };

    const result = plugin.execute(event);

    expect(result.event_properties?.phone).toBeUndefined();
    expect(result.event_properties?.phone_number).toBeUndefined();
    expect(result.event_properties?.name).toBe("John Doe");
  });

  it("should redact nested PII", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      event_properties: {
        user: {
          email: "test@example.com",
          name: "John Doe",
          phone: "+1234567890",
        },
        booking_id: "123",
      },
    };

    const result = plugin.execute(event);

    expect(result.event_properties?.user?.email).toBeUndefined();
    expect(result.event_properties?.user?.phone).toBeUndefined();
    expect(result.event_properties?.user?.name).toBe("John Doe");
    expect(result.event_properties?.booking_id).toBe("123");
  });

  it("should redact message content", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      event_properties: {
        message: "This is a private message",
        content: "Some content",
        notes: "Private notes",
        booking_id: "123",
      },
    };

    const result = plugin.execute(event);

    expect(result.event_properties?.message).toBeUndefined();
    expect(result.event_properties?.content).toBeUndefined();
    expect(result.event_properties?.notes).toBeUndefined();
    expect(result.event_properties?.booking_id).toBe("123");
  });

  it("should preserve non-PII properties", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      event_properties: {
        booking_id: "123",
        provider_id: "456",
        amount: 100,
        currency: "ZAR",
        status: "confirmed",
      },
    };

    const result = plugin.execute(event);

    expect(result.event_properties).toEqual(event.event_properties);
  });

  it("should redact from user properties", () => {
    const plugin = new PrivacyPlugin(createContext());
    const event: AmplitudeEvent = {
      event_type: "test_event",
      user_properties: {
        email: "test@example.com",
        role: "customer",
        city: "Cape Town",
      },
    };

    const result = plugin.execute(event);

    expect(result.user_properties?.email).toBeUndefined();
    expect(result.user_properties?.role).toBe("customer");
    expect(result.user_properties?.city).toBe("Cape Town");
  });
});
