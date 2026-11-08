import { BARBER_PHONE_PATTERN } from "../model/barber.model";

/**
 * Turns what a person types into the API format `+201XXXXXXXXX`.
 *
 * Accepts the common ways Egyptians write a mobile number — `01001234567`,
 * `1001234567`, `201001234567`, `+201001234567`, `00201001234567`, with spaces,
 * dashes or dots. Anything that doesn't look like one is returned cleaned but
 * unchanged so the validator can reject it.
 */
export function normalizeEgyptianPhone(input: string): string {
  const raw = (input ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0020")) return `+${digits.slice(2)}`; // 00201… → +201…
  if (digits.startsWith("20") && digits.length === 12) return `+${digits}`; // 201001234567
  if (digits.startsWith("01") && digits.length === 11) return `+20${digits.slice(1)}`; // 01001234567
  if (digits.startsWith("1") && digits.length === 10) return `+20${digits}`; // 1001234567

  return raw.startsWith("+") ? `+${digits}` : digits;
}

/** true when the (already normalised) phone is `+201` followed by 9 digits. */
export function isValidEgyptianMobile(phone: string): boolean {
  return BARBER_PHONE_PATTERN.test(phone);
}
