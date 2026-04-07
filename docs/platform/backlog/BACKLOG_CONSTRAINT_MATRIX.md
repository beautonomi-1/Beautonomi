# Backlog Constraint Matrix

Legend: **S** = server, **C** = client, **P** = public API, **A** = admin, **—** = not found / unclear.

| # | Backlog item | Domain | Actor | Rule / constraint | Enforced today | Server | Client | Gap / contradiction | Severity | Source of truth (recommended) | Blocker |
|---|----------------|--------|-------|---------------------|----------------|--------|--------|---------------------|----------|----------------------------------|---------|
| 1 | Package flow routing | Booking | Customer | Package catalog must map to `service_package_items`; optional `customer_package_entitlement_id` with `package_id` | S (`validate-booking`), P | ✓ | Partial | **Step order** still services→venue→packages; **`?package=` prefill** now loads package lines into cart (staff `any`) | High | **S** `validateBooking` + **C** URL prefill (`@beautonomi/utils`) | Product (optional step reorder) |
| 1 | Staff per service | Booking | Customer | Each line has `staff_id` / any | S + C `canProceed` | ✓ | ✓ | Group/multi-staff calendar uses first staff for `/api/availability` | Medium | S conflicts + segment checks | Product/calendar |
| 1.1 | Provider create booking | Booking | Provider | Same provider, staff, no double-book | S `create_booking_with_locking` | ✓ | Partial | Variants/products/geo may not mirror `validateBooking` | High | **S** single validation pipeline or shared helper | Architecture |
| 2 | Sticky CTA | UX | Customer | Continue always reachable pre-payment | C `BookingActionBar` fixed | — | ✓ | Payment step uses separate bar; verify `pb` on scroll container | Low | C layout tokens | None |
| 3 | Learning hub | Content | Cust/Prov | Role-based content | — | ? | ? | **Not mapped** in this audit | Medium | CMS or app routes | Discovery |
| 4 | Search focus | Mobile UX | Customer | Input stable while typing | C `InlineSearch` | — | Partial | Focus on `expanded` + `blurOnSubmit`; **device QA** to close | Medium | C focus + list stability | Mobile QA |
| 5 | Service zones | Service area | Provider | At-home zone coverage | S/API | Partial | Partial | Portal “should not require” zones — **tenant/product** rule missing | Medium | Tenant feature flags + API soft-fail | Product |
| 6 | Resource add/update | Resources | Provider | Valid `resource_type`, provider scope | S Zod in `resources/[id]/route` | ✓ | ? | UI may send legacy types | Medium | S schema + OpenAPI parity | Data drift |
| 7 | Cancellation policy | Policy | Customer | Ack before pay | C + P `cancellation-policy` | Partial | ✓ | Not shown on every surface | Medium | S policy rows + C before commitment | Product |
| 8 | Calendar connect | Integration | Provider | OAuth tokens valid | S sync jobs | Partial | — | Sync vs availability — **documented** risk | High | External calendar as **busy** feed only if product agrees | Product |
| 9 | Shifts visible | Scheduling | Provider | Shifts tied to `provider_staff` | S `staff/.../shifts` | ✓ | Partial | API accepts **`provider_staff.id` or `user_id`**; **UI** must still render shifts/blocks distinctly | Medium | **`resolveProviderStaffRowId`** + DB | None (API) |
| 10 | Blocked periods visible | Scheduling | Provider | Blocks from `availability_blocks` / `time_blocks` | S + public overlap | ✓ | Partial | Legend vs data | Medium | Same APIs as booking conflict | UI |
| 11 | Staff notifications | Notifications | Staff | Recipient resolves to user | S | Partial | — | **Shifts routes** fixed; **booking notify** path may still mismatch | **Critical** | `provider_staff` → `users` mapping | Backend/data |
| 12 | Team notification prefs | Preferences | Staff | Channel toggles | — | ? | ? | Not audited | Medium | `notification_preferences` (if exists) | Discovery |
| 13 | Provider subscription | Billing | Provider | Paid tier gates features | S + webhooks | Partial | Partial | Stale state | High | Billing provider + S | Integration |
| 14 | Ticket email | Support | Customer | Create ticket + email | S `notifySupportTicketCreated` | ✓ | — | Template **`support_ticket_created`** — verify **delivery** per env | High | Notification templates + provider logs | Ops |
| 15 | Help / contact | Support | All | Working links | C | — | Partial | — | Medium | CMS | Content |
| 16 | Delete client | CRM | Provider | Delete or soft-delete | S | Partial | Partial | List stale | Medium | S response + cache invalidation | UX |
| 17 | Client address / dedupe | Identity | Provider/Cust | Unique by policy | S | Partial | Partial | Signup merge | High | S merge rules | Product/legal |
| 18 | Calendar grid UX | Scheduling | Provider | Scroll/select/DnD | C `CalendarGrid` | — | Partial | **H-scroll + header sync** done; DnD still needs rules | High | S conflict check on move | Product |
| 19 | Group booking | Booking | Customer | Policy + services | S | Partial | Partial | Variants/products/packages per participant | **Critical** | S `validateBooking` matrix | Product |
| 20 | Provider appointment freeze | Reliability | Provider | No infinite load | C+S | Partial | Partial | Error boundaries | High | RPC errors surfaced | Engineering |

---

## Cross-cutting: Booking engine alignment

| Constraint | Should be S-authoritative |
|------------|----------------------------|
| Slot conflict | Yes — `create_booking_with_locking`, `validateBooking` |
| Package discount + entitlement | Yes |
| Staff-offering | Yes — `validate-booking` |
| Provider UI “quick book” | Must call same rules or **document** exceptions |

---

## Cross-cutting: Calendar truth

| Layer | Source |
|-------|--------|
| Customer slot grid | `/api/availability` or public slug (different engines — see domain audit) |
| Provider calendar | Fetches blocks + bookings + overlays |
| Connected calendar | Sync adapters — **not** automatically availability unless product says so |

---

*This matrix is a living document; update when APIs or UI change.*
