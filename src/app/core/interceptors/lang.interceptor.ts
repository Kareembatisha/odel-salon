import { HttpInterceptorFn } from "@angular/common/http";

import { readStoredLang } from "../services/language.service";

/**
 * langInterceptor
 *
 * Attaches the current app language on every outgoing request — as a `lang`
 * header (e.g. `lang: ar`) and as the standard `Accept-Language` header the API
 * contract uses for localized messages — so both data and server messages
 * match whatever language the user currently has selected.
 *
 * ── WHY THIS DOESN'T INJECT LanguageService ────────────────────────────
 * LanguageService depends on ngx-translate's TranslateService, whose HTTP
 * loader fetches translation JSON files via HttpClient — which runs
 * through this very interceptor. Injecting LanguageService here would
 * force it to construct mid-request, right as it's already partway
 * through constructing (it depends on TranslateService, which is what
 * triggered the HTTP call in the first place) → NG0200 circular
 * dependency.
 *
 * readStoredLang() is a plain function (no DI, no TranslateService), so
 * it reads the same localStorage key LanguageService itself is backed by
 * without touching Angular's injector at all — same source of truth,
 * zero risk of a cycle.
 */
export const langInterceptor: HttpInterceptorFn = (req, next) => {
  const lang = readStoredLang();

  // `lang` localizes data; `Accept-Language` is what the API reads to localize
  // its *messages* (success text, validation errors, 409 explanations).
  const localizedReq = req.clone({
    setHeaders: { lang, "Accept-Language": lang },
  });

  return next(localizedReq);
};
