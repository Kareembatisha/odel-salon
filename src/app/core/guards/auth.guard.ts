import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { AuthService } from "../../modules/auth/service/auth.service";
import { sanitizeReturnUrl } from "../../modules/auth/utils/return-url.util";

/**
 * authGuard
 *
 * Blocks access to protected route trees (e.g. `/main`) unless
 * the user is authenticated. Redirects to the login page otherwise, keeping
 * the originally requested URL as a `returnUrl` query param so the login
 * flow can send the user back where they intended to go.
 *
 * Usage:
 *   { path: 'main', canActivate: [authGuard], ... }
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(["/login"], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * guestGuard
 *
 * Inverse of authGuard — keeps already-authenticated users out of the auth
 * pages (login, forgot-password, ...) by redirecting them straight to the
 * app. Optional to wire up, provided for completeness.
 *
 * Usage:
 *   { path: 'auth', canActivate: [guestGuard], ... }
 */
export const guestGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  // Already-authenticated user hitting e.g. /login?returnUrl=/main/bookings/123
  // directly (bookmark, shared link, session restored in a new tab) — honor
  // the same safe returnUrl the login page itself would have used, instead
  // of always dropping them at the generic default route.
  const url = new URL(state.url, "https://internal.invalid");
  const returnUrl = url.searchParams.get("returnUrl");

  return router.parseUrl(sanitizeReturnUrl(returnUrl));
};
