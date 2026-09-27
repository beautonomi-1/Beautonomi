# ISMS Scope Statement

> Template. Replace every `[bracketed]` value, then submit for approval in the Security & Compliance hub.

## 1. Organisation

Beautonomi operates a beauty and wellness marketplace connecting customers with salons and independent providers in South Africa [and other markets].

## 2. Scope

The information security management system (ISMS) covers the people, processes and technology used to develop, operate and support:

- the customer web app and public API (`apps/web`);
- the admin portal (`apps/admin-web`), including the Security & Compliance hub;
- the provider and customer mobile apps (`apps/provider`, `apps/customer`);
- the Supabase production project (database, authentication, storage);
- hosting and delivery on Vercel, source control and CI/CD on GitHub, mobile builds on Expo EAS;
- integrations with payment, identity verification, messaging, maps and analytics providers listed in the vendor register.

Locations: [registered office address]; remote working locations of staff and contractors.

## 3. Exclusions

| Excluded | Justification |
|---|---|
| Data-centre physical security | Operated by Supabase and Vercel (and their cloud providers); covered through supplier assurance (control SUP-04). |
| [Other exclusions] | [Justification] |

## 4. Interfaces and dependencies

- **Suppliers:** see the vendor register. Critical suppliers are Supabase, Vercel, GitHub and Paystack.
- **Providers (salons):** use the platform under the provider terms; their own premises and systems are outside scope.
- **Customers:** use the apps under the customer terms.

## 5. Interested parties and their requirements

| Party | Security and privacy requirements |
|---|---|
| Customers | Confidentiality of personal and payment information; availability of bookings |
| Providers | Accurate payouts; protection of business and identity data |
| Information Regulator | POPIA compliance, breach notification |
| Payment providers | Secure integration; PCI DSS obligations on card data (card data handled by providers) |
| Investors and partners | Evidence of a managed security programme |
| Staff | Clear policies, training, safe reporting |

## 6. Approval

Approved by: [Name, title] — Date: [date]. Review at least annually and when the business, technology or legal context changes significantly.
