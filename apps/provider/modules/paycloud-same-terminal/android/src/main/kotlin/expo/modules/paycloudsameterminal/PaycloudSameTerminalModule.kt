package expo.modules.paycloudsameterminal

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
/**
 * Same-terminal WiseCashier Intent bridge for Wiseasy P5/P5L Android POS devices.
 *
 * Default Intent contract matches PayCloud Same-Terminal Application Integration;
 * override via `intent_contract` in the payload (sourced from tenant_paycloud_apps.metadata).
 */
class PaycloudSameTerminalModule : Module() {

  private var pendingPromise: Promise? = null
  private var timeoutRunnable: Runnable? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  companion object {
    private const val SALE_REQUEST_CODE = 42_001
    private const val SALE_TIMEOUT_MS = 5 * 60 * 1000L

    /** WiseCashier package on Wiseasy terminals — override via intent_contract.package_name */
    private const val DEFAULT_WISECASHIER_PACKAGE = "com.wiseasy.cashier"

    /** PayCloud same-terminal sale action — override via intent_contract.action */
    private const val DEFAULT_SALE_ACTION = "com.wiseasy.cashier.action.PAYMENT"

    /** PayCloud trans_status=2 (completed) */
    private const val TRANS_STATUS_COMPLETED = "2"
  }

  override fun definition() = ModuleDefinition {
    Name("PaycloudSameTerminal")

    OnActivityResult { _, result ->
      if (result.requestCode != SALE_REQUEST_CODE) return@OnActivityResult
      clearTimeout()

      val promise = pendingPromise
      pendingPromise = null
      if (promise == null) return@OnActivityResult

      if (result.resultCode == Activity.RESULT_CANCELED) {
        promise.resolve(
          mapOf(
            "success" to false,
            "trans_status" to "3",
            "message" to "Payment cancelled on device",
          ),
        )
        return@OnActivityResult
      }

      val data = result.data
      val transStatus =
        data?.getStringExtra("trans_status")
          ?: data?.getStringExtra("TRANS_STATUS")
          ?: if (result.resultCode == Activity.RESULT_OK) TRANS_STATUS_COMPLETED else null

      val message =
        data?.getStringExtra("message")
          ?: data?.getStringExtra("error_message")
          ?: data?.getStringExtra("response_message")

      val success =
        result.resultCode == Activity.RESULT_OK &&
          (transStatus == null || transStatus == TRANS_STATUS_COMPLETED)

      promise.resolve(
        mapOf(
          "success" to success,
          "trans_status" to transStatus,
          "message" to message,
        ),
      )
    }

    AsyncFunction("canLaunch") { promise: Promise ->
      promise.resolve(canLaunchWiseCashier(null))
    }

    AsyncFunction("getDeviceSerial") { promise: Promise ->
      promise.resolve(readDeviceSerial())
    }

    AsyncFunction("startSale") { payload: Map<String, Any?>, promise: Promise ->
      if (pendingPromise != null) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "Another payment is already in progress on this device.",
          ),
        )
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "App is not in the foreground.",
          ),
        )
        return@AsyncFunction
      }

      val contract = parseIntentContract(payload["intent_contract"])
      if (!canLaunchWiseCashier(contract)) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "WiseCashier is not installed on this device.",
          ),
        )
        return@AsyncFunction
      }

      val intent = buildSaleIntent(payload, contract)
      if (intent == null) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "Invalid payment payload.",
          ),
        )
        return@AsyncFunction
      }

      pendingPromise = promise
      scheduleTimeout()

      try {
        activity.startActivityForResult(intent, SALE_REQUEST_CODE)
      } catch (e: Exception) {
        clearTimeout()
        pendingPromise = null
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to (e.message ?: "Could not open WiseCashier."),
          ),
        )
      }
    }

    OnDestroy {
      clearTimeout()
      pendingPromise?.resolve(
        mapOf(
          "success" to false,
          "message" to "Payment interrupted.",
        ),
      )
      pendingPromise = null
    }
  }

  private data class IntentContract(
    val packageName: String,
    val action: String,
    val merchantOrderNoKey: String,
    val orderAmountKey: String,
    val currencyKey: String,
    val payScenarioKey: String,
    val payMethodIdKey: String,
    val transTypeKey: String,
    val tipAmountKey: String,
    val cashbackAmountKey: String,
    val appIdKey: String,
  )

  private fun parseIntentContract(raw: Any?): IntentContract {
    val map = raw as? Map<*, *>
    fun str(key: String, fallback: String): String {
      val v = map?.get(key)
      return if (v is String && v.isNotBlank()) v.trim() else fallback
    }
    return IntentContract(
      packageName = str("package_name", DEFAULT_WISECASHIER_PACKAGE),
      action = str("action", DEFAULT_SALE_ACTION),
      merchantOrderNoKey = str("merchant_order_no_key", "merchant_order_no"),
      orderAmountKey = str("order_amount_key", "order_amount"),
      currencyKey = str("currency_key", "price_currency"),
      payScenarioKey = str("pay_scenario_key", "pay_scenario"),
      payMethodIdKey = str("pay_method_id_key", "pay_method_id"),
      transTypeKey = str("trans_type_key", "trans_type"),
      tipAmountKey = str("tip_amount_key", "tip_amount"),
      cashbackAmountKey = str("cashback_amount_key", "cashback_amount"),
      appIdKey = str("app_id_key", "app_id"),
    )
  }

  private fun canLaunchWiseCashier(contract: IntentContract?): Boolean {
    val ctx = appContext.reactContext ?: return false
    val c = contract ?: IntentContract(
      DEFAULT_WISECASHIER_PACKAGE,
      DEFAULT_SALE_ACTION,
      "merchant_order_no",
      "order_amount",
      "price_currency",
      "pay_scenario",
      "pay_method_id",
      "trans_type",
      "tip_amount",
      "cashback_amount",
      "app_id",
    )

    val pm = ctx.packageManager
    try {
      pm.getPackageInfo(c.packageName, 0)
    } catch (_: PackageManager.NameNotFoundException) {
      return false
    }

    val probe = Intent(c.action).setPackage(c.packageName)
    return probe.resolveActivity(pm) != null
  }

  private fun buildSaleIntent(payload: Map<String, Any?>, contract: IntentContract): Intent? {
    val merchantOrderNo = payloadString(payload, "merchant_order_no") ?: return null
    val orderAmount = payloadString(payload, "order_amount") ?: return null
    val currency = payloadString(payload, "price_currency") ?: "ZAR"
    val payScenario = payloadString(payload, "pay_scenario") ?: "SWIPE_CARD"

    val intent = Intent(contract.action).setPackage(contract.packageName)
    intent.putExtra(contract.merchantOrderNoKey, merchantOrderNo)
    intent.putExtra(contract.orderAmountKey, orderAmount)
    intent.putExtra(contract.currencyKey, currency)
    intent.putExtra(contract.payScenarioKey, payScenario)

    payloadString(payload, "pay_method_id")?.let {
      intent.putExtra(contract.payMethodIdKey, it)
    }
    payloadNumber(payload, "trans_type")?.let {
      intent.putExtra(contract.transTypeKey, it)
    }
    payloadString(payload, "tip_amount")?.let {
      intent.putExtra(contract.tipAmountKey, it)
    }
    payloadString(payload, "cashback_amount")?.let {
      intent.putExtra(contract.cashbackAmountKey, it)
    }
    payloadString(payload, "app_id")?.let {
      intent.putExtra(contract.appIdKey, it)
    }

    return intent
  }

  private fun payloadString(payload: Map<String, Any?>, key: String): String? {
    val v = payload[key] ?: return null
    return when (v) {
      is String -> v.takeIf { it.isNotBlank() }
      is Number -> v.toString()
      else -> v.toString().takeIf { it.isNotBlank() }
    }
  }

  private fun payloadNumber(payload: Map<String, Any?>, key: String): Int? {
    val v = payload[key] ?: return null
    return when (v) {
      is Int -> v
      is Double -> v.toInt()
      is Float -> v.toInt()
      is String -> v.toIntOrNull()
      else -> null
    }
  }

  private fun readDeviceSerial(): String? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Build.getSerial().takeIf { it.isNotBlank() && it != Build.UNKNOWN }
      } else {
        @Suppress("DEPRECATION")
        Build.SERIAL.takeIf { it.isNotBlank() && it != Build.UNKNOWN }
      }
    } catch (_: SecurityException) {
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun scheduleTimeout() {
    clearTimeout()
    timeoutRunnable =
      Runnable {
        val promise = pendingPromise ?: return@Runnable
        pendingPromise = null
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "Payment timed out waiting for WiseCashier.",
          ),
        )
      }
    mainHandler.postDelayed(timeoutRunnable!!, SALE_TIMEOUT_MS)
  }

  private fun clearTimeout() {
    timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    timeoutRunnable = null
  }
}
