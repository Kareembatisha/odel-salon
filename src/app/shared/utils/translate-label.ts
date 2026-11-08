import { TranslateService } from "@ngx-translate/core";

/**
 * Translates `key`, falling back to `fallback` when no translation exists.
 * Used for labels that come from the backend (permission modules/actions):
 * known ones are localized, new ones still render their raw name.
 */
export function labelOrFallback(
  translate: TranslateService,
  key: string,
  fallback: string,
): string {
  const result = translate.instant(key);
  return result && result !== key ? result : fallback;
}
