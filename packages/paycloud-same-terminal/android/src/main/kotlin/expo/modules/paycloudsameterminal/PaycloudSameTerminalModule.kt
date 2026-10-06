package expo.modules.paycloudsameterminal

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Same-terminal WiseCashier Intent bridge for Wiseasy Android POS devices.
 *
 * Implements PayCloud SameTerminalAppIntegration:
 * - Action: com.wiseasy.transaction.call
 * - Extras: version (A01), appId, transType, transData (JSON string)
 * - Result: result ("00" = approved), resultMsg, transData (JSON string)
 *
 * Contract overrides via intent_contract in payload (tenant_paycloud_apps.metadata).
 */
class PaycloudSameTerminalModule : Module() {

  private var pendingPromise: Promise? = null
  private var timeoutRunnable: Runnable? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  companion object {
    private const val SALE_REQUEST_CODE = 42_001
    private const val PREINIT_REQUEST_CODE = 42_002
    private const val SALE_TIMEOUT_MS = 5 * 60 * 1000L
    private const val PREINIT_TIMEOUT_MS = 30_000L

    private const val DEFAULT_WISECASHIER_PACKAGE = "com.wiseasy.cashier"
    private const val DEFAULT_INTENT_ACTION = "com.wiseasy.transaction.call"
    private const val DEFAULT_VERSION = "A01"

    private const val RESULT_APPROVED = "00"

    private val WISEASY_SERIAL_PROPERTIES =
      listOf(
        "ro.serialno",
        "ro.boot.serialno",
        "persist.sys.serialno",
        "ro.wiseasy.serial",
      )
  }

  override fun definition() = ModuleDefinition {
    Name("PaycloudSameTerminal")

    OnActivityResult { _, result ->
      when (result.requestCode) {
        SALE_REQUEST_CODE -> handleSaleResult(result.resultCode, result.data)
        PREINIT_REQUEST_CODE -> handlePreInitResult(result.resultCode, result.data)
      }
    }

    AsyncFunction("canLaunch") { promise: Promise ->
      promise.resolve(canLaunchWiseCashier(null))
    }

    AsyncFunction("getDeviceSerial") { promise: Promise ->
      val info = readDeviceInfo()
      promise.resolve(info["serial"])
    }

    AsyncFunction("getDeviceInfo") { promise: Promise ->
      promise.resolve(readDeviceInfo())
    }

    AsyncFunction("preInit") { payload: Map<String, Any?>, promise: Promise ->
      if (pendingPromise != null) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "Another payment operation is already in progress on this device.",
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

      val appId = payloadString(payload, "appId") ?: payloadString(payload, "app_id")
      if (appId.isNullOrBlank()) {
        promise.resolve(
          mapOf(
            "success" to false,
            "message" to "Invalid PRE-INIT payload — appId is required.",
          ),
        )
        return@AsyncFunction
      }

      val intent = buildBaseIntent(contract)
      putExtra(intent, contract.versionKey, payloadString(payload, "version") ?: DEFAULT_VERSION)
      putExtra(intent, contract.appIdKey, appId)
      putExtra(intent, contract.transTypeKey, "PRE-INIT")

      pendingPromise = promise
      scheduleTimeout(PREINIT_TIMEOUT_MS)

      try {
        activity.startActivityForResult(intent, PREINIT_REQUEST_CODE)
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
      scheduleTimeout(SALE_TIMEOUT_MS)

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
    val versionKey: String,
    val appIdKey: String,
    val transTypeKey: String,
    val transDataKey: String,
  )

  private fun parseIntentContract(raw: Any?): IntentContract {
    val map = raw as? Map<*, *>
    fun str(key: String, fallback: String): String {
      val v = map?.get(key)
      return if (v is String && v.isNotBlank()) v.trim() else fallback
    }
    return IntentContract(
      packageName = str("package_name", DEFAULT_WISECASHIER_PACKAGE),
      action = str("action", DEFAULT_INTENT_ACTION),
      versionKey = str("version_key", "version"),
      appIdKey = str("app_id_key", "appId"),
      transTypeKey = str("trans_type_key", "transType"),
      transDataKey = str("trans_data_key", "transData"),
    )
  }

  private fun canLaunchWiseCashier(contract: IntentContract?): Boolean {
    val ctx = appContext.reactContext ?: return false
    val c =
      contract
        ?: IntentContract(
          DEFAULT_WISECASHIER_PACKAGE,
          DEFAULT_INTENT_ACTION,
          "version",
          "appId",
          "transType",
          "transData",
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

  private fun buildBaseIntent(contract: IntentContract): Intent =
    Intent(contract.action).setPackage(contract.packageName)

  private fun buildSaleIntent(payload: Map<String, Any?>, contract: IntentContract): Intent? {
    val appId = payloadString(payload, "appId") ?: payloadString(payload, "app_id") ?: return null
    val transType = payloadString(payload, "transType") ?: payloadString(payload, "trans_type") ?: "SALE"
    val version = payloadString(payload, "version") ?: DEFAULT_VERSION
    val transDataJson = serializeTransData(payload["transData"] ?: payload["trans_data"]) ?: return null

    val intent = buildBaseIntent(contract)
    putExtra(intent, contract.versionKey, version)
    putExtra(intent, contract.appIdKey, appId)
    putExtra(intent, contract.transTypeKey, transType)
    putExtra(intent, contract.transDataKey, transDataJson)
    return intent
  }

  private fun serializeTransData(raw: Any?): String? {
    when (raw) {
      is String -> return raw.takeIf { it.isNotBlank() }
      is Map<*, *> -> {
        val json = JSONObject()
        for ((key, value) in raw) {
          if (key == null || value == null) continue
          json.put(key.toString(), value)
        }
        return json.toString()
      }
      null -> return null
      else -> return null
    }
  }

  private fun handleSaleResult(resultCode: Int, data: Intent?) {
    clearTimeout()
    val promise = pendingPromise
    pendingPromise = null
    if (promise == null) return

    if (resultCode == Activity.RESULT_CANCELED && data == null) {
      promise.resolve(
        mapOf(
          "success" to false,
          "result" to "K026",
          "resultMsg" to "Payment cancelled on device",
          "message" to humanizeResultCode("K026", "Payment cancelled on device"),
        ),
      )
      return
    }

    val parsed = parseIntentResponse(data)
    val approved = parsed["result"] == RESULT_APPROVED
    promise.resolve(
      mapOf(
        "success" to approved,
        "result" to parsed["result"],
        "resultMsg" to parsed["resultMsg"],
        "transData" to parsed["transData"],
        "message" to humanizeResultCode(parsed["result"], parsed["resultMsg"]),
      ),
    )
  }

  private fun handlePreInitResult(resultCode: Int, data: Intent?) {
    clearTimeout()
    val promise = pendingPromise
    pendingPromise = null
    if (promise == null) return

    val parsed = parseIntentResponse(data)
    val approved = parsed["result"] == RESULT_APPROVED
    promise.resolve(
      mapOf(
        "success" to approved,
        "result" to parsed["result"],
        "resultMsg" to parsed["resultMsg"],
        "message" to humanizeResultCode(parsed["result"], parsed["resultMsg"]),
      ),
    )
  }

  private fun parseIntentResponse(data: Intent?): Map<String, String?> {
    if (data == null) {
      return mapOf("result" to null, "resultMsg" to null, "transData" to null)
    }
    return mapOf(
      "result" to data.getStringExtra("result"),
      "resultMsg" to data.getStringExtra("resultMsg"),
      "transData" to data.getStringExtra("transData"),
    )
  }

  private fun humanizeResultCode(code: String?, fallback: String?): String {
    if (code == null || code.isBlank()) {
      return fallback?.takeIf { it.isNotBlank() } ?: "Payment did not complete — try again"
    }
    if (code == RESULT_APPROVED) return "Payment approved"
    val mapped =
      when (code) {
        "K026" -> "Payment cancelled on the card machine"
        "K027" -> "Payment timed out — try again"
        "M016" -> "Duplicate order number — start a new payment"
        "M002" -> "Invalid payment details — check amount and try again"
        "M003" -> "Invalid amount"
        "M007" -> "This payment type is not supported on this device"
        "M008" -> "Payment app version mismatch — contact support"
        "J000", "J001" -> "Network error — check connection and try again"
        "J002" -> "Network connection timed out"
        "J003" -> "Network connection failed"
        "G003" -> "PIN entry cancelled"
        "G004" -> "PIN entry timed out"
        "C009" -> "Card read timed out — try again"
        "Q004", "Q007" -> "Card machine is not fully configured — contact support"
        else -> null
      }
    return mapped ?: fallback?.takeIf { it.isNotBlank() } ?: "Payment error ($code)"
  }

  private fun readDeviceInfo(): Map<String, String?> {
    val manufacturer = Build.MANUFACTURER?.takeIf { it.isNotBlank() }
    val model = Build.MODEL?.takeIf { it.isNotBlank() }

    val buildSerial =
      try {
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

    if (!buildSerial.isNullOrBlank()) {
      return mapOf(
        "serial" to buildSerial,
        "manufacturer" to manufacturer,
        "model" to model,
        "serialSource" to "build_serial",
      )
    }

    for (prop in WISEASY_SERIAL_PROPERTIES) {
      val value = readSystemProperty(prop)
      if (!value.isNullOrBlank() && value != Build.UNKNOWN) {
        return mapOf(
          "serial" to value,
          "manufacturer" to manufacturer,
          "model" to model,
          "serialSource" to "wiseasy_property",
        )
      }
    }

    val ctx = appContext.reactContext
    val androidId =
      ctx?.let {
        Settings.Secure.getString(it.contentResolver, Settings.Secure.ANDROID_ID)
          ?.takeIf { id -> id.isNotBlank() && id != "9774d56d682e549c" }
      }

    return mapOf(
      "serial" to androidId,
      "manufacturer" to manufacturer,
      "model" to model,
      "serialSource" to if (androidId != null) "android_id" else null,
    )
  }

  private fun readSystemProperty(key: String): String? {
    return try {
      val clazz = Class.forName("android.os.SystemProperties")
      val get = clazz.getMethod("get", String::class.java)
      (get.invoke(null, key) as? String)?.trim()?.takeIf { it.isNotEmpty() }
    } catch (_: Exception) {
      null
    }
  }

  private fun putExtra(intent: Intent, key: String, value: String) {
    intent.putExtra(key, value)
  }

  private fun payloadString(payload: Map<String, Any?>, key: String): String? {
    val v = payload[key] ?: return null
    return when (v) {
      is String -> v.takeIf { it.isNotBlank() }
      is Number -> v.toString()
      else -> v.toString().takeIf { it.isNotBlank() }
    }
  }

  private fun scheduleTimeout(ms: Long) {
    clearTimeout()
    timeoutRunnable =
      Runnable {
        val promise = pendingPromise ?: return@Runnable
        pendingPromise = null
        promise.resolve(
          mapOf(
            "success" to false,
            "result" to "K027",
            "resultMsg" to "Payment timed out waiting for WiseCashier.",
            "message" to humanizeResultCode("K027", "Payment timed out waiting for WiseCashier."),
          ),
        )
      }
    mainHandler.postDelayed(timeoutRunnable!!, ms)
  }

  private fun clearTimeout() {
    timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    timeoutRunnable = null
  }
}
