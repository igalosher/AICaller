import { createDefaultStagedFlow } from "../src/flow/defaultStagedFlow.js";
import { restoreStagedEngine } from "../src/flow/stagedFlowRuntime.js";
import { processStagedUtterance } from "../src/flow/stagedFlowRuntime.js";
import { classifyUtterance } from "../src/services/intentService.js";
import { prisma } from "../src/db.js";
import { seedDefaultIntents } from "../src/services/intentService.js";

const contact = { firstName: "דוד", familyName: "כהן" };

async function classify(text: string, currentNodeId?: string) {
  return classifyUtterance(text, { currentNodeId });
}

async function run() {
  await seedDefaultIntents();
  const def = createDefaultStagedFlow();
  const engine = restoreStagedEngine(def, "opening", null, "{}");

  let r = await processStagedUtterance(engine, contact, "מה ההצעה", await classify("מה ההצעה"));
  console.assert(engine.currentStageId === "ask_tv_count", "advance opening -> tv count");
  console.log("✓ opening -> tv count");

  r = await processStagedUtterance(
    engine,
    contact,
    "שתיים",
    await classify("שתיים", engine.currentStageId),
  );
  console.assert(engine.currentStageId === "ask_internet_type", "tv count -> internet");
  console.assert(!r.sayText.includes("טלוויזיות"), "internet step does not repeat TV question");
  console.assert(r.sayText.includes("תשתית"), "only internet question after TV answer");
  console.log("✓ tv count -> internet type (separate steps)");

  r = await processStagedUtterance(engine, contact, "הסר", await classify("הסר"));
  console.assert(r.endCall && r.contactStatus === "blacklisted", "opt-out blacklists");
  console.log("✓ opt-out");

  const engine2 = restoreStagedEngine(def, "ask_tv_count", null, "{}");
  engine2.lastSpokenText =
    "על מנת שנוכל להתאים לך את החבילה המשתלמת ביותר נשמח לדעת כמה טלויזיות יש לך בבית";
  r = await processStagedUtterance(engine2, contact, "מה?", await classify("מה?"));
  console.assert(engine2.currentStageId === "ask_tv_count", "stay on stage after repeat");
  console.log("✓ repeat last statement");

  const engine3 = restoreStagedEngine(def, "ask_internet_type", null, "{}");
  r = await processStagedUtterance(engine3, contact, "רגיל", await classify("רגיל"));
  console.assert(engine3.currentSubflowId === "fiber_eligibility_check", "regular -> fiber subflow");
  console.assert(r.sayText.includes("כתובת"), "address prompt");
  console.log("✓ regular -> address");

  const engine4 = restoreStagedEngine(def, "opening", null, "{}");
  r = await processStagedUtterance(
    engine4,
    contact,
    "יש לכם ספורט 5?",
    await classify("יש לכם ספורט 5?"),
  );
  console.assert(engine4.currentStageId === "opening", "Q&A stays on stage");
  console.log("✓ Q&A interrupt stays on stage");

  // Fiber-exists path: one spoken line per step through sales_path
  const fe = restoreStagedEngine(def, "ask_internet_type", null, "{}");
  let step = await processStagedUtterance(fe, contact, "סיבים", await classify("סיבים"));
  console.assert(step.sayText.includes("מעולה") && !step.sayText.includes("מהירות"), "fiber ack only");
  step = await processStagedUtterance(fe, contact, "כן", await classify("כן"));
  console.assert(step.sayText.includes("מהירות") && !step.sayText.includes("ספק"), "speed only");
  step = await processStagedUtterance(fe, contact, "גיגה", await classify("גיגה"));
  console.assert(step.sayText.includes("ספק") && !step.sayText.includes("משלמת"), "provider only");
  step = await processStagedUtterance(fe, contact, "בזק", await classify("בזק"));
  console.assert(step.sayText.includes("משלמת") && !step.sayText.includes("הצעה מעולה"), "price only");
  console.log("✓ sales path one question per step");

  const digitOnTv = await classifyUtterance("3", { scopedAnswerIntents: ["provide_tv_count"] });
  console.assert(digitOnTv.intentId === "provide_tv_count", "digit scoped to TV count");
  const digitOnInet = await classifyUtterance("1", {
    scopedAnswerIntents: ["internet_regular", "internet_fiber", "internet_unknown", "no_internet"],
  });
  console.assert(digitOnInet.intentId !== "provide_tv_count", "digit on internet scope is not TV count");
  console.log("✓ scoped qualification intents");

  console.log("\nAll staged flow tests passed.");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
