/**
 * Amplitude Smoke Test
 * Validates event delivery to Amplitude
 */

const https = require("https");

const AMPLITUDE_API_ENDPOINT = "https://api2.amplitude.com/2/httpapi";

async function sendTestEvent(apiKey) {
  return new Promise((resolve, reject) => {
    const event = {
      api_key: apiKey,
      events: [
        {
          event_type: "smoke_test",
          user_id: "smoke_test_user",
          event_properties: {
            test: true,
            timestamp: new Date().toISOString(),
          },
          time: Date.now(),
        },
      ],
    };

    const data = JSON.stringify(event);

    const options = {
      hostname: "api2.amplitude.com",
      path: "/2/httpapi",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode === 200 && parsed.code === 200) {
            resolve({
              success: true,
              eventsIngested: parsed.events_ingested,
              message: parsed.message,
            });
          } else {
            reject({
              success: false,
              statusCode: res.statusCode,
              response: parsed,
            });
          }
        } catch {
          reject({
            success: false,
            error: "Failed to parse response",
            rawResponse: responseData,
          });
        }
      });
    });

    req.on("error", (error) => {
      reject({
        success: false,
        error: error.message,
      });
    });

    req.write(data);
    req.end();
  });
}

async function runSmokeTest() {
  const apiKey = process.env.AMPLITUDE_API_KEY || process.argv[2];

  if (!apiKey) {
    console.error("Error: Amplitude API key required");
    console.error("Usage: node amplitude-smoke-test.js <api_key>");
    console.error("Or set AMPLITUDE_API_KEY environment variable");
    process.exit(1);
  }

  console.log("Running Amplitude smoke test...");
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`Endpoint: ${AMPLITUDE_API_ENDPOINT}`);
  console.log("");

  try {
    const result = await sendTestEvent(apiKey);
    console.log("✅ Smoke test passed!");
    console.log(`Events ingested: ${result.eventsIngested}`);
    if (result.message) {
      console.log(`Message: ${result.message}`);
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ Smoke test failed!");
    console.error("Error:", error);
    process.exit(1);
  }
}

runSmokeTest();
