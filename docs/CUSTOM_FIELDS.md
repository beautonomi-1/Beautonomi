# Custom Fields (Platform-Defined)

Custom fields let the **platform (superadmin)** define extra data to collect for **users**, **providers**, **bookings**, and **services**. Definitions are managed in **Admin → Custom Fields**; values are collected and stored when users or providers edit profiles, complete bookings, or edit services.

## How it works

| Layer | Who | Where |
|-------|-----|--------|
| **Definitions** | Superadmin only | Admin → Custom Fields: create fields per entity type (user, provider, booking, service) with name, label, type (text, textarea, number, email, phone, date, select, checkbox, radio), required, placeholder, help text, default, display order. |
| **Values** | Consumers | Stored in `custom_field_values` (entity_type, entity_id, custom_field_id, value). RLS ensures providers can only read/write their own provider, bookings, and offerings; customers their own user and bookings. |

- **API (consumer):**  
  - `GET /api/custom-fields/definitions?entity_type=provider` – active definitions for that entity type (authenticated).  
  - `GET /api/custom-fields/values?entity_type=provider&entity_id=...` – current values (auth + ownership).  
  - `PUT /api/custom-fields/values` – body `{ entity_type, entity_id, values: { [field_name]: value } }` (auth + ownership).

- **UI:** The shared component `CustomFieldsForm` (entityType, entityId?, initialValues?, onChange?) is used on:
  - **Provider:** Settings → Business details (“Additional information” section).
  - **User:** Profile page (“Additional details” section).
  - **Booking:** Review step on `/book/continue` (“Additional details”); values are sent with the consume request and saved after the booking is created.

For **service** (entity_type = service), `entity_id` is the **offering** id. You can add `CustomFieldsForm` to the provider’s service/offering create/edit UI and pass the offering id when editing.

## Example use cases

1. **Provider – business details**  
   Superadmin adds fields: “Registration number”, “Specialties” (textarea), “Year established” (number). Providers see these under Settings → Business details and fill them once. Useful for compliance, search/filters, or display on the public profile.

2. **User – profile**  
   Fields like “Skin type” (select: Oily, Dry, Combination, Normal), “Accessibility needs” (textarea), “Preferred contact method” (radio). Used for personalization, accessibility, or provider notes.

3. **Booking**  
   “Special requests or notes” (textarea), “How did you hear about us?” (select), “Preferred stylist” (text). Collected at review step before payment; stored with the booking so the provider sees them in the appointment.

4. **Service (offering)**  
   “Preparation required” (textarea), “Certification required” (checkbox). Lets each service have extra metadata defined by the platform and edited by the provider per offering.

## Relevance for superadmin

- **Custom Fields** in admin are the single place to define what extra data exists for each entity type. No code change is needed to add a new field; superadmin creates it and it appears in the right consumer forms (provider settings, profile, booking, service edit) where `CustomFieldsForm` is used.
- **Tax (Admin → Taxes):** Providers control their own tax (Settings → Sales → Taxes). Admin Taxes is for the **platform tax rate catalog** (reference_data) and platform-wide stats; superadmin can override a provider’s rate if needed. So it is still relevant: catalog + overrides + reporting.
