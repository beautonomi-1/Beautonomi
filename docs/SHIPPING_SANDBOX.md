# Courier sandbox checklist

Run opt-in contract tests in `packages/shipping`:

| Courier | Env flags | Notes |
|---------|-----------|--------|
| Courier Guy (ShipLogic) | `SHIPLOGIC_SANDBOX=1`, `SHIPLOGIC_API_KEY` | Uses `/v2/rates` and `/v2/shipments`. Confirm tracking query param in sandbox. |
| Bob Go | `BOB_GO_SANDBOX=1`, `BOB_GO_API_KEY`, optional `BOB_GO_BASE_URL=https://api.sandbox.bobgo.co.za/v2` | Production base `https://api.bobgo.co.za/v2`. Send `timeout` on `/v2/rates`. Waybill via `/v2/shipments/waybill`. |
| Aramex | `ARAMEX_SANDBOX=1`, account env vars | Dev host `ws.dev.aramex.net`. Requires real contacts and `ShippingDateTime` / `DueDate`. |

Provider-owned keys are stored encrypted in `provider_courier_credentials` (service role only). Do not enable a courier in production UI until its sandbox row passes.
