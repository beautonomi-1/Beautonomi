# Mobile Permissions QA

Use real devices where possible. Reset app permissions between scenarios from iOS Settings or Android App info.

## Customer App

- Profile photo and onboarding photo: verify `Take Photo` opens the camera after granting access, `Photo Library` opens gallery after granting access, deny shows retry/settings recovery, and blocked permission opens Settings.
- iOS photo library: verify full access works, limited access still lets the selected photo upload, and revoking access in Settings shows recovery on the next attempt.
- Location: verify nearby/explore and address current-location flows request foreground location in context, fall back where available, and show Settings recovery after blocked permission.
- Calendar: verify save-to-calendar grants, denial, blocked Settings recovery, and no writable-calendar fallback messaging.
- Push notifications: verify onboarding explains notifications, denial does not block app use, and Settings recovery is shown when permission is off.
- Notification skip: tap `Not now` or skip setup and verify the app does not immediately re-prompt after onboarding finishes.
- First-session ordering: verify Home/nearby location does not trigger the OS location prompt before the onboarding location explanation.

## Provider App

- Onboarding/gallery/profile/catalogue/product/business logo/verification/support/booking consent: verify photo library grant, deny, blocked, and Settings recovery.
- Gallery and messaging on Android: verify picker/camera launches after modal/action-sheet dismissal and does not no-op.
- Explore posts and messaging video: verify library video selection and camera video recording; confirm microphone prompt/copy appears when the OS requires it.
- QR scanner: verify camera grant, deny, blocked Settings recovery, scanner open/close, and manual code fallback remains available.
- QR Settings return: after tapping `Open Settings`, grant camera permission, return to the app, and verify the scanner refreshes without closing/reopening.
- Location: verify provider onboarding address, location management, booking creation, group booking address, journey start, and arrival flows request foreground location in context and continue gracefully if skipped.
- Push notifications: verify onboarding notification prompt, denial, Settings recovery, and device registration after permission is later granted.
- Notification skip: tap `Not now` or skip setup and verify the provider app does not immediately re-prompt after onboarding finishes.
- Camera purpose copy: verify iOS camera prompt copy is appropriate for QR scanning, photo capture, and video capture.

## Platform Matrix

- iOS: first ask, allow, deny, limited photos, revoke in Settings, blocked Settings recovery.
- Android 13+: first ask, allow, deny once, deny permanently, revoke in Settings, notification permission, media picker, camera, microphone for video, foreground location.
- Android 12 and below: legacy media behavior, camera, microphone for video, foreground location, Settings recovery.
