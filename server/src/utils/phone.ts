const ISRAELI_MOBILE = /^0?5\d{8}$/;
const ISRAELI_LANDLINE = /^0[23489]\d{7}$/;

export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith("05") && digits.length === 10) {
    return digits;
  }
  if (digits.startsWith("5") && digits.length === 9) {
    return `0${digits}`;
  }
  return digits.startsWith("0") ? digits : `0${digits}`;
}

export function isValidIsraeliPhone(phone: string): boolean {
  const normalized = normalizeIsraeliPhone(phone);
  return ISRAELI_MOBILE.test(normalized) || ISRAELI_LANDLINE.test(normalized);
}

export function toE164(phone: string): string {
  const normalized = normalizeIsraeliPhone(phone);
  return `+972${normalized.replace(/^0/, "")}`;
}

/** Digits-only E.164 form for comparing numbers across formats (+9720… vs +972…). */
export function canonicalE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("9720")) {
    return `972${digits.slice(4)}`;
  }
  if (digits.startsWith("972")) {
    return digits;
  }
  const local = normalizeIsraeliPhone(phone).replace(/\D/g, "");
  return `972${local.replace(/^0/, "")}`;
}
