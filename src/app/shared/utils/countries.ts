import { SelectOption } from '../components/float-label-select/float-label-select';

/** [ISO region, dial code] — the markets Odel operates in plus a few common others. */
const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ['EG', '+20'], ['SA', '+966'], ['AE', '+971'], ['KW', '+965'], ['QA', '+974'], ['BH', '+973'],
  ['OM', '+968'], ['JO', '+962'], ['LB', '+961'], ['IQ', '+964'], ['LY', '+218'], ['SD', '+249'],
  ['MA', '+212'], ['DZ', '+213'], ['TN', '+216'], ['GB', '+44'], ['US', '+1'],
];

export const DEFAULT_COUNTRY_CODE = '+20';

/**
 * Dial-code options labelled with the localized country name ("Egypt +20" / "مصر +20").
 * `current` keeps a code the backend stored selectable even if it isn't in the short list.
 */
export function countryOptions(lang: string, current?: string | null): SelectOption[] {
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  // U+2066…U+2069 isolate the "+20" so it doesn't flip in right-to-left text.
  const options = COUNTRIES.map(([iso, code]) => ({ value: code, label: `${names.of(iso) ?? iso} \u2066${code}\u2069` }));
  if (current && !options.some((o) => o.value === current)) {
    options.unshift({ value: current, label: `\u2066${current}\u2069` });
  }
  return options;
}
