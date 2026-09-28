# Risk Management Methodology

## 1. When we assess risk

- Quarterly review of the whole register.
- Before significant changes (new product, new supplier handling personal data, architecture change).
- After major incidents, audit findings or pentest results.

## 2. Scoring

**Likelihood (1–5):** 1 Rare (less than once in 5 years) · 2 Unlikely · 3 Possible (once in 1–2 years) · 4 Likely · 5 Almost certain (several times a year).

**Impact (1–5)** — use the highest applicable:

| Score | Financial | Customers / data | Regulatory | Operations |
|---|---|---|---|---|
| 1 | < R10k | No personal data | None | < 1 hour |
| 2 | R10k–100k | Few records, low sensitivity | Minor query | < 4 hours |
| 3 | R100k–1m | Hundreds of records | Regulator notification | < 1 day |
| 4 | R1m–5m | Thousands of records or Restricted data | Enforcement notice | 1–3 days |
| 5 | > R5m | Large-scale or ID/bank data | Fine / criminal liability | > 3 days |

**Score = likelihood × impact** (1–25). Record both **inherent** (before controls) and **residual** (after controls) scores.

## 3. Appetite

The appetite score is set by management in hub settings (default **12**). A residual score at or above the appetite is **above appetite**.

## 4. Treatment

| Option | When |
|---|---|
| Mitigate | Add or improve controls; link controls to the risk |
| Transfer | Insurance or contract (the risk owner still owns the risk) |
| Avoid | Stop the activity |
| Accept | Only with documented rationale and expiry (at most 12 months) |

Acceptance **below** appetite: proposed and recorded by a risk manager. Acceptance **above** appetite: proposed by a risk manager **and** approved by a different management approver. The hub enforces this.

## 5. Ownership

Every risk has an owner who can decide on treatment and budget. The risk manager maintains the register; the ISMS manager reports the top risks at management review.

## 6. Records

The risk register, treatment decisions and acceptance records in the hub are the formal records. The Statement of Applicability links treatment to Annex A controls.
