# Game Day Runbook

Use this runbook to execute and close failure drills before high-scale rollout.

## Drill Cadence

- Pre-launch: run all drills once and close findings.
- Post-launch: run one drill every 2 weeks, rotating scenarios.

## Scenario 1: Payment Provider Degradation

### Objective

Validate booking and reconciliation behavior when payment callbacks are delayed/failing.

### Inject

- Temporarily reject webhook signatures in staging OR route webhook traffic to a controlled failing endpoint.

### Expected

- New incidents trigger `payment/webhook` alerts.
- Reconciliation queue grows but remains bounded.
- User-facing booking flow avoids indefinite hangs and surfaces fallback messaging.

### Exit Criteria

- Alert fired and acknowledged.
- Recovery path verified (queue drains after restoring provider).
- Postmortem action items created.

## Scenario 2: Database Latency Spike

### Objective

Ensure API routes apply backpressure and preserve correctness under DB slowdown.

### Inject

- Introduce artificial latency in staging DB path (proxy/throttle or synthetic heavy query load).

### Expected

- Tier-1 latency alarms fire.
- Non-critical routes degrade first; critical routes remain within recovery envelope.
- No data corruption/duplicate booking transitions.

### Exit Criteria

- SLO burn alert observed.
- Throughput and error rates return to baseline after recovery.
- Documented tuning actions for any bottlenecks.

## Scenario 3: Cron/Background Backlog

### Objective

Verify backlog visibility and operational response.

### Inject

- Pause one cron worker class (staging) for one interval, then resume.

### Expected

- Queue/cron lag alert triggers.
- Backlog is measurable and drains on resume.
- No silent drops in scheduled jobs.

### Exit Criteria

- Alert and dashboard evidence captured.
- Drain time recorded against SLO.
- Retry/dead-letter behavior validated.

## Scenario 4: Notification Degradation

### Objective

Confirm notification outages do not break core booking and payment workflows.

### Inject

- Disable push/SMS provider keys in staging for the drill window.

### Expected

- Core booking flow still succeeds.
- Notification failures are logged and visible.
- Pending notifications are replayable/recoverable.

### Exit Criteria

- Incident surfaced through alerts.
- Replay strategy validated after restoring provider.
- User-impact communication template updated if needed.

## Drill Artifact Template

For every drill, capture:

- scenario, date, owner
- start/end time and timeline
- alerts triggered (with IDs/links)
- affected SLOs
- what failed, what worked
- action items with owner and due date

Store artifacts under `docs/incidents/game-days/`.
