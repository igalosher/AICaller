import "dotenv/config";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL;
const testTo = process.argv[2];

async function main() {
  if (!accountSid || !authToken || !fromNumber) {
    console.error("Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER in server/.env");
    process.exit(1);
  }
  if (!webhookBase || webhookBase.includes("localhost")) {
    console.error("TWILIO_WEBHOOK_BASE_URL must be a public HTTPS URL (e.g. ngrok).");
    process.exit(1);
  }

  const client = twilio(accountSid, authToken);

  console.log("Testing Twilio account...");
  const account = await client.api.accounts(accountSid).fetch();
  console.log(`✓ Account: ${account.friendlyName} (${account.status})`);

  if (!testTo) {
    console.log("\nConnection OK. To place a test call:");
    console.log("  npm run test:twilio -- +972501234567");
    return;
  }

  const callId = `test-${Date.now()}`;
  console.log(`\nPlacing test call to ${testTo} from ${fromNumber}...`);
  const call = await client.calls.create({
    to: testTo,
    from: fromNumber,
    url: `${webhookBase}/api/webhooks/twilio/voice?callId=${callId}`,
    statusCallback: `${webhookBase}/api/webhooks/twilio/status?callId=${callId}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed", "busy", "no-answer", "failed"],
    statusCallbackMethod: "POST",
  });

  console.log(`✓ Call initiated: ${call.sid} (status: ${call.status})`);
  console.log("Watch server logs and Twilio console for status updates.");
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
