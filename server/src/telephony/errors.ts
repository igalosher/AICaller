import { AppError } from "../middleware/errorHandler.js";

const TWILIO_MESSAGES: Record<number, string> = {
  21219:
    "Twilio דוחה את השיחה למרות שהמספר מופיע כמאומת. בדוק ב-Console שהמספר שמור כ-+972546688208 (בלי 0 אחרי 972). אם נרשמת עם מספר מחוץ לישראל, בחשבון ניסיון אפשר להתקשר רק למדינת ההרשמה. אפשר גם לשדרג את החשבון.",
  21211: "מספר היעד לא תקין.",
  21214: "מספר המקור (From) לא תקין או לא פעיל בחשבון Twilio.",
  21608: "אין הרשאה להתקשר למספר זה.",
  21610: "המספר ברשימת חסומים.",
};

export function toTelephonyError(err: unknown): AppError {
  const twilio = err as { status?: number; code?: number; message?: string };
  if (twilio?.code && TWILIO_MESSAGES[twilio.code]) {
    return new AppError(400, TWILIO_MESSAGES[twilio.code]!, `TWILIO_${twilio.code}`);
  }
  if (twilio?.message) {
    return new AppError(400, `שגיאת Twilio: ${twilio.message}`, "TWILIO_ERROR");
  }
  return new AppError(500, "שגיאה בהפעלת שיחה", "CALL_FAILED");
}
