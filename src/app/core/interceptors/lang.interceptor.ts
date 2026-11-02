import { HttpInterceptorFn } from "@angular/common/http";

import { readStoredLang } from "../services/language.service";

/**
 * langInterceptor
 *
 * Attaches the current app language as a `lang` header on every outgoing
 * request (e.g. `lang: ar` / `lang: en`), so the API can return localized
 * data matching whatever language the user currently has selected.
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

  const localizedReq = req.clone({
    setHeaders: { lang },
  });

  return next(localizedReq);
};
