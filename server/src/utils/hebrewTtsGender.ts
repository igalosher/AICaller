import type { CustomerSex } from "./genderHebrew.js";

/**
 * Homographs addressed to the listener — same spelling, different pronunciation.
 * Niqqud hints ElevenLabs v3 Hebrew without changing visible transcript text.
 * Applied only right before TTS; UI/transcript keep standard orthography.
 */
const PRONUNCIATION_FORMS: { pattern: RegExp; male: string; female: string }[] = [
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)לך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "לְךָ", female: "לָךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)אליך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "אֵלֶיךָ", female: "אֵלַיִךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)אלייך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "אֵלֶיךָ", female: "אֵלַיִךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)שלך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "שֶׁלְּךָ", female: "שֶׁלָּךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)איתך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "אִתְּךָ", female: "אִתָּךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)עבורך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "עֲבוּרְךָ", female: "עֲבוּרֵךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)בשבילך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "בִּשְׁבִילְךָ", female: "בִּשְׁבִילֵךְ" },
];

/** Text sent to ElevenLabs — same words as transcript, pronunciation tuned to addressee sex. */
export function adaptHebrewTextForTts(text: string, sex: CustomerSex = "male"): string {
  if (!text.trim()) return text;
  let out = text;
  for (const { pattern, male, female } of PRONUNCIATION_FORMS) {
    out = out.replace(pattern, sex === "female" ? female : male);
  }
  return out;
}
