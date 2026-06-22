import "dotenv/config";
import WebSocket from "ws";

const key = process.env.DEEPGRAM_API_KEY!;
const q = "encoding=mulaw&sample_rate=8000&model=nova-3&language=he&punctuate=true&interim_results=true";
const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, {
  headers: { Authorization: `Token ${key}` },
});
ws.on("open", () => {
  console.log("OK nova-3 he");
  ws.close();
});
ws.on("error", (e) => {
  console.log("FAIL", e.message);
  process.exit(1);
});
