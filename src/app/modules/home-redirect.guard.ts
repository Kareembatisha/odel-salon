import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { NAV_SECTIONS } from "../layout/main-layout/nav.config";
import { AuthService } from "./auth/service/auth.service";

/** Where to go when the user can't open any sidebar section (sign-in is enough for the profile). */
const FALLBACK = "/main/profile";

/**
 * `/main` has no page of its own: send the user to the first sidebar item they are allowed to
 * open (same rule the sidebar uses to show or hide items), or to their profile.
 */
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const first = NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => item.route && (!item.permission || auth.hasPermission(item.permission)),
  );

  return router.createUrlTree([first?.route ?? FALLBACK]);
};
