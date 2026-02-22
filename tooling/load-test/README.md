# Load Testing — Beautonomi Booking Flow

This directory contains [k6](https://k6.io/) load test scripts that simulate real user journeys against the Beautonomi API.

## Prerequisites

Install k6 on your machine:

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker pull grafana/k6
```

## Running the tests

### Against local dev server

```bash
# Start the web app first
pnpm dev:web

# Then in another terminal
k6 run tooling/load-test/k6-booking-flow.js
```

### Against a staging/production URL

```bash
k6 run -e BASE_URL=https://staging.beautonomi.com tooling/load-test/k6-booking-flow.js
```

### With authentication

```bash
k6 run \
  -e BASE_URL=https://staging.beautonomi.com \
  -e AUTH_TOKEN=<your-jwt-token> \
  tooling/load-test/k6-booking-flow.js
```

## What it tests

The script simulates the full booking flow:

| Step | Endpoint | Method |
|------|----------|--------|
| 1. Search | `/api/public/search` | GET |
| 2. View provider | `/api/public/providers/:id` | GET |
| 3. Check availability | `/api/public/providers/:id/availability` | GET |
| 4. Create hold | `/api/bookings/hold` | POST |
| 5. Create booking | `/api/bookings` | POST |

## Load profile

| Phase | Duration | Virtual Users |
|-------|----------|---------------|
| Ramp up | 1 min | 0 → 50 |
| Sustain | 3 min | 50 |
| Ramp down | 1 min | 50 → 0 |

## Thresholds

- **95th percentile response time** < 2 seconds (per step)
- **Failure rate** < 10 %

## Custom metrics

| Metric | Description |
|--------|-------------|
| `search_duration` | Search endpoint latency |
| `provider_view_duration` | Provider profile latency |
| `availability_duration` | Availability check latency |
| `hold_duration` | Booking hold creation latency |
| `booking_duration` | Booking creation latency |
| `failed_requests` | Rate of requests that didn't pass checks |

## Customization

Edit the `options.stages` array in `k6-booking-flow.js` to change the load profile. Adjust thresholds in `options.thresholds` to match your SLA targets.
