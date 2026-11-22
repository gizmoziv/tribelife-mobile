import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Turns a raw contact number into WhatsApp digits (E.164 without the '+') and an
 * international display form. Returns null when it cannot be made international.
 */
export function intlPhone(
  raw: string,
  region: string | null,
): { waDigits: string; display: string } | null {
  const defaultCountry = region ? (region as CountryCode) : undefined;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isPossible()) return null;
  return {
    waDigits: parsed.number.replace(/^\+/, ''),
    display: parsed.formatInternational(),
  };
}
