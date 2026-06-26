import { resolveGenderMarkers, type CustomerSex } from "./genderHebrew.js";

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
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)אינך(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "אֵינְךָ", female: "אֵינֵךְ" },
  { pattern: /(?<=[\s,.:;!?״"'\u05BE(\[]|^)אתה(?=[\s,.:;!?״"'\u05BE)\]]|$)/gu, male: "אַתָּה", female: "אַתְ" },
];

/** Different spelling per sex — normalize to addressee form then apply niqqud. */
const ADDRESSEE_FORMS: {
  male: string;
  female: string;
  maleNiqqud: string;
  femaleNiqqud: string;
}[] = [
  { male: "מעוניין", female: "מעוניינת", maleNiqqud: "מְעוּנְיָן", femaleNiqqud: "מְעוּנְיֶנֶת" },
  { male: "תרצה", female: "תרצי", maleNiqqud: "תִּרְצֶה", femaleNiqqud: "תִּרְצִי" },
  { male: "תוכל", female: "תוכלי", maleNiqqud: "תּוּכַל", femaleNiqqud: "תּוּכְלִי" },
  { male: "מוכן", female: "מוכנה", maleNiqqud: "מוּכָן", femaleNiqqud: "מוּכָנָה" },
  { male: "בטוח", female: "בטוחה", maleNiqqud: "בָּטוּחַ", femaleNiqqud: "בָּטוּחָה" },
  { male: "משלם", female: "משלמת", maleNiqqud: "מְשַׁלֵּם", femaleNiqqud: "מְשַׁלֶּמֶת" },
];

const WORD_EDGE_BEFORE = String.raw`(?<=[\s,.:;!?״"'\u05BE(\[]|^)`;
const WORD_EDGE_AFTER = String.raw`(?=[\s,.:;!?״"'\u05BE)\]]|$)`;

/** `מעוניין/ת` → מעוניין (male) or מעוניינת (female) before niqqud. */
function resolveSlashGenderForms(text: string, sex: CustomerSex): string {
  if (sex === "male") {
    return text.replace(/([\u0590-\u05FF]+)\/ת/g, "$1");
  }
  return text.replace(/([\u0590-\u05FF]+?)\/ת/g, (_, base: string) => {
    if (base.endsWith("ן")) return `${base.slice(0, -1)}נת`;
    if (base.endsWith("ה")) return `${base.slice(0, -1)}ת`;
    return `${base}ת`;
  });
}

function applyAddresseeWordForms(text: string, sex: CustomerSex): string {
  let out = text;
  for (const { male, female, maleNiqqud, femaleNiqqud } of ADDRESSEE_FORMS) {
    const maleRe = new RegExp(`${WORD_EDGE_BEFORE}${male}${WORD_EDGE_AFTER}`, "gu");
    const femaleRe = new RegExp(`${WORD_EDGE_BEFORE}${female}${WORD_EDGE_AFTER}`, "gu");
    if (sex === "female") {
      out = out.replace(maleRe, femaleNiqqud);
      out = out.replace(femaleRe, femaleNiqqud);
    } else {
      out = out.replace(femaleRe, maleNiqqud);
      out = out.replace(maleRe, maleNiqqud);
    }
  }
  return out;
}

/** Text sent to ElevenLabs — transcript unchanged; pronunciation tuned to addressee sex via niqqud. */
export function adaptHebrewTextForTts(text: string, sex: CustomerSex = "male"): string {
  if (!text.trim()) return text;
  let out = resolveGenderMarkers(text, sex);
  out = resolveSlashGenderForms(out, sex);
  out = applyAddresseeWordForms(out, sex);
  for (const { pattern, male, female } of PRONUNCIATION_FORMS) {
    out = out.replace(pattern, sex === "female" ? female : male);
  }
  return out;
}
