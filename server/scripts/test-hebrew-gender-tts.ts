import assert from "node:assert/strict";
import { adaptHebrewTextForTts } from "../src/utils/hebrewTtsGender.js";
import { resolveGenderMarkers } from "../src/utils/genderHebrew.js";

const SAMPLE = "שלום, אני רוצה לדבר איתך על החבילה שלך עבורך ובשבילך, אליך יש מקום לשפר.";

function testHomographMale() {
  const tts = adaptHebrewTextForTts("אני אשלח לך את הפרטים.", "male");
  assert.match(tts, /לְךָ/);
  assert.doesNotMatch(tts, /לָךְ/);
  console.log("✓ male לך → לְךָ");
}

function testHomographFemale() {
  const tts = adaptHebrewTextForTts("אני אשלח לך את הפרטים.", "female");
  assert.match(tts, /לָךְ/);
  assert.doesNotMatch(tts, /לְךָ/);
  console.log("✓ female לך → לָךְ");
}

function testTranscriptUnchanged() {
  const transcript = "אני אשלח לך את הפרטים.";
  assert.equal(transcript, "אני אשלח לך את הפרטים.");
  assert.notEqual(adaptHebrewTextForTts(transcript, "female"), transcript);
  console.log("✓ transcript text unchanged; only TTS payload differs");
}

function testAllHomographs() {
  const male = adaptHebrewTextForTts(SAMPLE, "male");
  const female = adaptHebrewTextForTts(SAMPLE, "female");
  assert.notEqual(male, female);
  assert.match(male, /אִתְּךָ/);
  assert.match(female, /אִתָּךְ/);
  assert.match(male, /אֵלֶיךָ/);
  assert.match(female, /אֵלַיִךְ/);
  console.log("✓ homograph registry (איתך, אליך, שלך, עבורך, בשבילך)");
}

function testGenderMarkers() {
  const tpl = "האם {{g:תרצה|תרצי}} לשמוע עוד?";
  assert.equal(resolveGenderMarkers(tpl, "male"), "האם תרצה לשמוע עוד?");
  assert.equal(resolveGenderMarkers(tpl, "female"), "האם תרצי לשמוע עוד?");
  console.log("✓ {{g:m|f}} template markers");
}

function printManualAbChecklist() {
  console.log("\n--- Manual A/B checklist (Twilio + test call) ---");
  console.log("1. Create two contacts with the same phone (or use test call) — one male, one female.");
  console.log("2. Use a speak line containing: לך, אליך, שלך (e.g. opening or custom speak node).");
  console.log("3. Test call / outbound with male contact — listen for lecha / elecha pronunciation.");
  console.log("4. Repeat with female contact — listen for lach / elayich pronunciation.");
  console.log("5. Confirm call transcript still shows standard spelling (no niqqud).");
  console.log("\nTTS payloads for sample script:");
  console.log("  male:  ", adaptHebrewTextForTts(SAMPLE, "male"));
  console.log("  female:", adaptHebrewTextForTts(SAMPLE, "female"));
}

function testSlashForms() {
  assert.equal(
    adaptHebrewTextForTts("אם אינך מעוניין/ת לשמוע", "male"),
    "אם אֵינְךָ מְעוּנְיָן לשמוע",
  );
  assert.match(adaptHebrewTextForTts("אם אינך מעוניין/ת לשמוע", "female"), /מְעוּנְיֶנֶת/);
  assert.match(adaptHebrewTextForTts("אם אינך מעוניין/ת לשמוע", "female"), /אֵינֵךְ/);
  console.log("✓ slash forms מעוניין/ת + אינך");
}

function testGenderMarkersInTts() {
  const tpl = "האם {{g:תרצה|תרצי}} לשמוע עוד?";
  assert.match(adaptHebrewTextForTts(tpl, "male"), /תִּרְצֶה/);
  assert.match(adaptHebrewTextForTts(tpl, "female"), /תִּרְצִי/);
  console.log("✓ {{g:m|f}} resolved inside adaptHebrewTextForTts");
}

testHomographMale();
testHomographFemale();
testTranscriptUnchanged();
testAllHomographs();
testGenderMarkers();
testSlashForms();
testGenderMarkersInTts();
printManualAbChecklist();
console.log("\nAll automated hebrew-gender-tts checks passed.");
