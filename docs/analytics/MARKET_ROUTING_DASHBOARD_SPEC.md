# Market Routing Dashboard Spec

Small, opinionated dashboard/query spec for monitoring market auto-routing quality from day one.

## Goal

Detect and reduce false-positive routing while respecting manual user overrides.

## Event coverage (already instrumented)

| Event | Meaning | Primary source files |
|---|---|---|
| `market_auto_switch_attempted` | Auto-switch decision executed (global entry -> market host) | `apps/web/src/components/global/MarketAvailabilityGate.tsx`, `apps/customer/src/components/MarketAvailabilityGate.tsx`, `apps/provider/src/components/MarketAvailabilityGate.tsx` |
| `market_auto_switch_suppressed` | Auto-switch was possible but blocked due to active manual override | Same as above |
| `market_manual_switch` | User explicitly switched market (or chose to remain on current market) | Same as above |
| `market_switch_declined` | User explicitly declined suggested market switch | Same as above |

## Canonical dimensions

Use these dimensions across charts/queries (some are optional by platform):

- `platform` (`web`, `ios`, `android`, `provider`)
- `from_host`
- `to_host`
- `country_code`
- `source` (`query`, `header_hint`, `host`, `geo_header`, `default`, `user_preference`)
- `confidence` (`high`, `medium`, `low`)
- `reason` (`manual_override`, `unsupported`, `restricted`, `manual`)
- `portal` (`provider` for provider-side events)

## Core KPIs

Track these as daily and 7-day rolling metrics:

1. **Auto-switch volume**
   - Formula: `count(event = market_auto_switch_attempted)`
2. **Auto-switch suppression rate**
   - Formula: `count(market_auto_switch_suppressed) / count(market_auto_switch_attempted + market_auto_switch_suppressed)`
3. **Manual override rate**
   - Formula: `count(market_manual_switch where reason in [manual, unsupported, restricted]) / active_users`
4. **Decline rate (suggested switch declined)**
   - Formula: `count(market_switch_declined) / count(market_manual_switch where reason in [unsupported, restricted] + market_switch_declined)`
5. **Low-confidence auto-switch share**
   - Formula: `count(market_auto_switch_attempted where confidence = low) / count(market_auto_switch_attempted)`
   - Target should trend toward zero.

## Dashboard layout (minimum)

1. **Routing Overview (last 7d)**
   - Total auto-switch attempted
   - Suppressed count
   - Manual switch count
   - Declined count

2. **Quality Funnel (last 7d)**
   - Attempted -> Suppressed -> Manual Switch -> Declined

3. **By Source + Confidence**
   - Stacked bar: `market_auto_switch_attempted` by `source`, split by `confidence`
   - Table: top `from_host -> to_host` pairs with counts

4. **Country Segment Table**
   - Rows: `country_code`
   - Columns: attempts, suppressed, manual, declined, suppression rate, decline rate

5. **Portal/Platform Slice**
   - Web vs customer mobile vs provider mobile trend lines

## Query templates (Amplitude-style pseudo SQL)

### 1) Daily routing events
```sql
SELECT
  date_trunc('day', event_time) AS day,
  event_type,
  COUNT(*) AS events
FROM events
WHERE event_type IN (
  'market_auto_switch_attempted',
  'market_auto_switch_suppressed',
  'market_manual_switch',
  'market_switch_declined'
)
  AND event_time >= now() - interval '30 day'
GROUP BY 1, 2
ORDER BY 1, 2;
```

### 2) Suppression rate by country
```sql
WITH base AS (
  SELECT
    COALESCE(country_code, 'UNK') AS country_code,
    SUM(CASE WHEN event_type = 'market_auto_switch_attempted' THEN 1 ELSE 0 END) AS attempted,
    SUM(CASE WHEN event_type = 'market_auto_switch_suppressed' THEN 1 ELSE 0 END) AS suppressed
  FROM events
  WHERE event_type IN ('market_auto_switch_attempted', 'market_auto_switch_suppressed')
    AND event_time >= now() - interval '30 day'
  GROUP BY 1
)
SELECT
  country_code,
  attempted,
  suppressed,
  CASE WHEN attempted + suppressed = 0 THEN 0
       ELSE suppressed::float / (attempted + suppressed) END AS suppression_rate
FROM base
ORDER BY suppression_rate DESC, attempted DESC;
```

### 3) Top suspicious routes (false-positive candidates)
```sql
SELECT
  from_host,
  to_host,
  source,
  confidence,
  COUNT(*) AS attempts
FROM events
WHERE event_type = 'market_auto_switch_attempted'
  AND event_time >= now() - interval '14 day'
GROUP BY 1,2,3,4
ORDER BY attempts DESC
LIMIT 50;
```

## Alert thresholds (starter)

- **P2:** `low-confidence auto-switch share > 5%` for 30 minutes
- **P2:** `decline rate > 25%` for any country over 24h
- **P3:** `suppression rate > 70%` for a stable market over 7d (signals excessive auto-switch pressure)

## Weekly review checklist

- Are top `from_host -> to_host` transitions expected?
- Which countries have highest decline rate?
- Are we over-triggering on `geo_header` source?
- Should any country/domain mapping move from inferred -> explicit config?
- Did manual override TTL reduce repeat prompts without hurting conversion?
# Market Routing Dashboard Spec

Small, opinionated dashboard/query spec for monitoring market auto-routing quality from day one.

## Goal

Detect and reduce false-positive routing while respecting manual user overrides.

## Event coverage (already instrumented)

| Event | Meaning | Primary source files |
|---|---|---|
| `market_auto_switch_attempted` | Auto-switch decision executed (global entry -> market host) | `apps/web/src/components/global/MarketAvailabilityGate.tsx`, `apps/customer/src/components/MarketAvailabilityGate.tsx`, `apps/provider/src/components/MarketAvailabilityGate.tsx` |
| `market_auto_switch_suppressed` | Auto-switch was possible but blocked due to active manual override | Same as above |
| `market_manual_switch` | User explicitly switched market (or chose to remain on current market) | Same as above |
| `market_switch_declined` | User explicitly declined suggested market switch | Same as above |

## Canonical dimensions

Use these dimensions across charts/queries (some are optional by platform):

- `platform` (`web`, `ios`, `android`, `provider`)
- `from_host`
- `to_host`
- `country_code`
- `source` (`query`, `header_hint`, `host`, `geo_header`, `default`, `user_preference`)
- `confidence` (`high`, `medium`, `low`)
- `reason` (`manual_override`, `unsupported`, `restricted`, `manual`)
- `portal` (`provider` for provider-side events)

## Core KPIs

Track these as daily and 7-day rolling metrics:

1. **Auto-switch volume**
   - Formula: `count(event = market_auto_switch_attempted)`
2. **Auto-switch suppression rate**
   - Formula: `count(market_auto_switch_suppressed) / count(market_auto_switch_attempted + market_auto_switch_suppressed)`
3. **Manual override rate**
   - Formula: `count(market_manual_switch where reason in [manual, unsupported, restricted]) / active_users`
4. **Decline rate (suggested switch declined)**
   - Formula: `count(market_switch_declined) / count(market_manual_switch where reason in [unsupported, restricted] + market_switch_declined)`
5. **Low-confidence auto-switch share**
   - Formula: `count(market_auto_switch_attempted where confidence = low) / count(market_auto_switch_attempted)`
   - Target should trend toward zero.

## Dashboard layout (minimum)

1. **Routing Overview (last 7d)**
   - Total auto-switch attempted
   - Suppressed count
   - Manual switch count
   - Declined count

2. **Quality Funnel (last 7d)**
   - Attempted -> Suppressed -> Manual Switch -> Declined

3. **By Source + Confidence**
   - Stacked bar: `market_auto_switch_attempted` by `source`, split by `confidence`
   - Table: top `from_host -> to_host` pairs with counts

4. **Country Segment Table**
   - Rows: `country_code`
   - Columns: attempts, suppressed, manual, declined, suppression rate, decline rate

5. **Portal/Platform Slice**
   - Web vs customer mobile vs provider mobile trend lines

## Query templates (Amplitude-style pseudo SQL)

### 1) Daily routing events
```sql
SELECT
  date_trunc('day', event_time) AS day,
  event_type,
  COUNT(*) AS events
FROM events
WHERE event_type IN (
  'market_auto_switch_attempted',
  'market_auto_switch_suppressed',
  'market_manual_switch',
  'market_switch_declined'
)
  AND event_time >= now() - interval '30 day'
GROUP BY 1, 2
ORDER BY 1, 2;
```

### 2) Suppression rate by country
```sql
WITH base AS (
  SELECT
    COALESCE(country_code, 'UNK') AS country_code,
    SUM(CASE WHEN event_type = 'market_auto_switch_attempted' THEN 1 ELSE 0 END) AS attempted,
    SUM(CASE WHEN event_type = 'market_auto_switch_suppressed' THEN 1 ELSE 0 END) AS suppressed
  FROM events
  WHERE event_type IN ('market_auto_switch_attempted', 'market_auto_switch_suppressed')
    AND event_time >= now() - interval '30 day'
  GROUP BY 1
)
SELECT
  country_code,
  attempted,
  suppressed,
  CASE WHEN attempted + suppressed = 0 THEN 0
       ELSE suppressed::float / (attempted + suppressed) END AS suppression_rate
FROM base
ORDER BY suppression_rate DESC, attempted DESC;
```

### 3) Top suspicious routes (false-positive candidates)
```sql
SELECT
  from_host,
  to_host,
  source,
  confidence,
  COUNT(*) AS attempts
FROM events
WHERE event_type = 'market_auto_switch_attempted'
  AND event_time >= now() - interval '14 day'
GROUP BY 1,2,3,4
ORDER BY attempts DESC
LIMIT 50;
```

## Alert thresholds (starter)

- **P2:** `low-confidence auto-switch share > 5%` for 30 minutes
- **P2:** `decline rate > 25%` for any country over 24h
- **P3:** `suppression rate > 70%` for a stable market over 7d (signals excessive auto-switch pressure)

## Weekly review checklist

- Are top `from_host -> to_host` transitions expected?
- Which countries have highest decline rate?
- Are we over-triggering on `geo_header` source?
- Should any country/domain mapping move from inferred -> explicit config?
- Did manual override TTL reduce repeat prompts without hurting conversion?
