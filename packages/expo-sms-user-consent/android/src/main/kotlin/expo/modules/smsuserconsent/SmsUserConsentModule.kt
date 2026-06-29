package expo.modules.smsuserconsent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val SMS_CONSENT_REQUEST = 20_221

/**
 * Android SMS User Consent API — presents the OS one-tap consent dialog when a
 * verification SMS arrives, then resolves with the full SMS body so the JS layer
 * can extract the numeric code.
 *
 * No READ_SMS / RECEIVE_SMS permission is needed. The 5-minute listener window
 * is started by `startSmsUserConsent(null)` (null = accept SMS from any sender).
 *
 * Lifecycle:
 *   JS calls `startSmsListener()` → starts GMS listener + registers broadcast receiver.
 *   SMS arrives → receiver fires → OS consent Intent is launched as activity result.
 *   User taps "Yes" → `onActivityResult` resolves the promise with the SMS body.
 *   Timeout / user dismisses / cancel() → promise resolves with null.
 */
class SmsUserConsentModule : Module() {

  private var smsReceiver: BroadcastReceiver? = null
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {

    Name("SmsUserConsent")

    // Activity result handler — called when the OS consent dialog completes.
    OnActivityResult { _, result ->
      if (result.requestCode != SMS_CONSENT_REQUEST) return@OnActivityResult
      val smsBody: String? =
        if (result.resultCode == Activity.RESULT_OK)
          result.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
        else null
      pendingPromise?.resolve(smsBody)
      pendingPromise = null
      unregisterReceiver()
    }

    /**
     * Start listening for an incoming OTP SMS and show the OS consent dialog.
     * Resolves with the SMS body string, or null on timeout / dismiss / error.
     * Only one listener is active at a time; calling again cancels the previous.
     */
    AsyncFunction("startSmsListener") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      // Cancel any previous in-flight listener.
      pendingPromise?.resolve(null)
      unregisterReceiver()
      pendingPromise = promise

      SmsRetriever.getClient(activity)
        .startSmsUserConsent(null /* senderPhoneNumber — null accepts any sender */)
        .addOnSuccessListener {
          val receiver = buildBroadcastReceiver()
          smsReceiver = receiver
          val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
          // Gate the receiver with the GMS SEND permission so only Google Play
          // Services can deliver the broadcast (prevents broadcast spoofing).
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // API 33+: the broadcast originates from GMS (external), so EXPORTED.
            activity.registerReceiver(
              receiver,
              filter,
              SmsRetriever.SEND_PERMISSION,
              null,
              Context.RECEIVER_EXPORTED,
            )
          } else {
            activity.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null)
          }
        }
        .addOnFailureListener {
          // Google Play Services unavailable or task failed — resolve null, no crash.
          pendingPromise?.resolve(null)
          pendingPromise = null
        }
    }

    /** Cancel a pending listener and resolve its promise with null. */
    Function("cancel") {
      pendingPromise?.resolve(null)
      pendingPromise = null
      unregisterReceiver()
    }

    OnDestroy {
      pendingPromise?.resolve(null)
      pendingPromise = null
      unregisterReceiver()
    }
  }

  /**
   * Build the BroadcastReceiver that receives the SMS_RETRIEVED_ACTION broadcast
   * and launches the OS consent intent as a startActivityForResult call.
   */
  private fun buildBroadcastReceiver() = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return

      val extras = intent.extras ?: return
      val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return

      when (status.statusCode) {
        CommonStatusCodes.SUCCESS -> {
          val consentIntent = extractConsentIntent(extras)

          if (consentIntent == null) {
            pendingPromise?.resolve(null)
            pendingPromise = null
            unregisterReceiver()
            return
          }

          try {
            appContext.currentActivity?.startActivityForResult(consentIntent, SMS_CONSENT_REQUEST)
          } catch (_: Exception) {
            pendingPromise?.resolve(null)
            pendingPromise = null
            unregisterReceiver()
          }
        }

        CommonStatusCodes.TIMEOUT -> {
          pendingPromise?.resolve(null)
          pendingPromise = null
          unregisterReceiver()
        }
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun extractConsentIntent(extras: android.os.Bundle): Intent? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT, Intent::class.java)
    else
      extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT)

  private fun unregisterReceiver() {
    smsReceiver?.let { receiver ->
      try {
        appContext.currentActivity?.unregisterReceiver(receiver)
      } catch (_: Exception) {
        // Receiver may not be registered if the activity was destroyed.
      }
      smsReceiver = null
    }
  }
}
