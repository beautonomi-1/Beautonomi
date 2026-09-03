# Customer iOS — App Store Connect submission checklist (v1.0.88)

Use this checklist when resubmitting **Beautonomi Customer** (`com.beautonomi`) after App Review rejection (Guideline 2.3.6 age rating, 2.1 ATT, proactive 1.2 UGC).

Related: [APP_STORE_AGE_RATING.md](../../../docs/APP_STORE_AGE_RATING.md) · [IOS_RELEASE_SUBMIT.md](../../../docs/IOS_RELEASE_SUBMIT.md)

---

## 1. Version & build

- [ ] App Store Connect → **1.0.88** with iOS build **281**
- [ ] `apps/customer/app.config.js`: `version: "1.0.88"`, `buildNumber: "281"`, `versionCode: 281`
- [ ] EAS production iOS build uploaded to TestFlight

---

## 2. Age rating (Guideline 2.3.6)

Keep Connect answers: **Parental Controls = Yes**, **Age Assurance = Yes** (see age-rating doc).

Reviewers must find controls **without signing in**:

1. Login screen → **Safety & parental controls**
2. Screen explains parental controls + opens Age Suitability policy

After sign-in (demo OTP **246810**):

1. Profile tab → **Safety & parental controls**
2. **Parental controls — content & safety**
3. **Age assurance & date of birth**

---

## 3. EULA (Guideline 1.2 proactive)

| Field | Value |
| --- | --- |
| **EULA URL** | `https://www.beautonomi.com/customer/eula` |
| **Privacy Policy** | `https://www.beautonomi.com/privacy-policy` |
| **In-app** | Blocking EULA gate before login/signup |

---

## 4. App Tracking Transparency (Guideline 2.1)

- App Privacy: **Tracking = Yes** (Device ID for attribution after consent)
- ATT prompt appears **after splash hide**, before Singular/Amplitude
- Attach screen recording: delete app → reinstall TestFlight → launch → ATT dialog

---

## 5. Review notes (paste)

```text
AGE RATING — Parental Controls & Age Assurance (Guideline 2.3.6)

PRE-LOGIN (no account needed):
Login screen → "Safety & parental controls" → explains in-app mechanisms and opens Age Suitability policy.

POST-LOGIN (demo account):
Email nomi@ferdose.com OR phone 716429097 → OTP 246810

1. Profile tab (bottom navigation) → Safety & parental controls
2. Parental controls — content & safety → Restricted mode, hide social feed, disable messaging/comments, sensitive content filter
3. Age assurance & date of birth → view/edit DOB, see age band

Age Suitability URL: https://www.beautonomi.com/age-suitability
EULA: https://www.beautonomi.com/customer/eula

ATT (Guideline 2.1):
Delete app → reinstall → ATT prompt after splash, before analytics. Screen recording attached.
```

---

## 6. Submit

1. Attach build **281** to version **1.0.88**
2. Paste review notes + ATT recording
3. **Submit for Review**
