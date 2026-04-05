# Global Routing Go-Live Checklist

Operational checklist for launching and scaling automatic market routing safely.

## 1) Configuration gates

- [ ] `STRICT_TENANT_HOST_RESOLUTION=true` in production.
- [ ] `SUPPORTED_MARKET_COUNTRIES` includes only launched markets.
- [ ] `RESTRICTED_COUNTRIES` is approved by legal/compliance.
- [ ] `NEXT_PUBLIC_GLOBAL_ENTRY_HOST` is set (e.g. `beautonomi.com`).
- [ ] `NEXT_PUBLIC_DEFAULT_MARKET_HOST` is set to a launched transactional market.
- [ ] `MARKET_AUTO_SWITCH_ENABLED` is explicitly set for this release.
- [ ] `MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES` set for canary rollout (start small).
- [ ] `NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS` and mobile TTL envs are aligned.

## 2) Data readiness

- [ ] `tenants` rows exist and are active for each launched market.
- [ ] `tenant_domains` has one active primary hostname per launched tenant.
- [ ] Global entry host maps to global-entry tenant intent (not pinned to single market country in host-country map).
- [ ] `TENANT_HOST_COUNTRY_MAP` includes only ccTLD/market hosts (not global entry host).

## 3) API and write-flow protection

- [ ] Booking/hold creation blocks unsupported/restricted/global-entry writes.
- [ ] Restricted-country behavior validated for all transactional writes in release scope.
- [ ] Unknown hosts fail closed (no implicit fallback writes).

## 4) Analytics and dashboards

- [ ] Market routing dashboard created from `docs/analytics/MARKET_ROUTING_DASHBOARD_SPEC.md`.
- [ ] Events flowing in production:
  - `market_auto_switch_attempted`
  - `market_auto_switch_suppressed`
  - `market_manual_switch`
  - `market_switch_declined`
- [ ] Alert thresholds configured:
  - Low-confidence auto-switch share
  - Decline rate by country
  - Suppression rate trend

## 5) Test matrix (must pass)

- [ ] Global entry + launched country (auto-switch expected).
- [ ] Global entry + unsupported country (gate shown; no transaction).
- [ ] Global entry + restricted country (hard blocked).
- [ ] ccTLD host with conflicting geo header (host intent wins).
- [ ] Manual override set -> auto-switch suppressed within TTL window.
- [ ] Manual override expiry -> auto-switch resumes as expected.
- [ ] Logged-in user with `preferred_home_tenant_id` gets consistent routing.

## 6) Rollout plan

- [ ] Stage A: `MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES` includes one market only.
- [ ] Stage B: add second market after 24h stability window.
- [ ] Stage C: expand allow-list to all launched markets.
- [ ] Defined rollback path:
  - set `MARKET_AUTO_SWITCH_ENABLED=false`
  - keep manual switch + gates active

## 7) Exit criteria (GO / NO-GO)

**GO** when:
- All checks above pass.
- No critical routing regressions in staging.
- Dashboard KPIs within thresholds for canary window.

**NO-GO** when:
- Unknown hosts still resolve without strict mode.
- Decline/override rates indicate high false-positive routing.
- Any transactional flow bypasses market/compliance guards.
