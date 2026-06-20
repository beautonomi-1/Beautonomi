import { DeviceEventEmitter } from "react-native";
import {
  PROVIDER_ROLE_CHANGED_EVENT,
  emitProviderRoleChanged,
  type ProviderRoleChangedPayload,
} from "@/lib/provider-role-events";

describe("provider-role-events", () => {
  it("delivers the role payload to listeners", () => {
    const received: Array<string | null> = [];
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_ROLE_CHANGED_EVENT,
      (payload: ProviderRoleChangedPayload) => {
        received.push(payload.role);
      },
    );

    emitProviderRoleChanged("provider_owner");
    emitProviderRoleChanged(null);

    sub.remove();

    expect(received).toEqual(["provider_owner", null]);
  });

  it("stops notifying after the listener is removed", () => {
    const received: Array<string | null> = [];
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_ROLE_CHANGED_EVENT,
      (payload: ProviderRoleChangedPayload) => {
        received.push(payload.role);
      },
    );

    emitProviderRoleChanged("provider_staff");
    sub.remove();
    emitProviderRoleChanged("superadmin");

    expect(received).toEqual(["provider_staff"]);
  });
});
