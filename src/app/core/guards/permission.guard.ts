import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { AuthService } from "../../modules/auth/service/auth.service";

/**
 * permissionGuard
 *
 * Checks the current user's permissions (as returned by `POST /login`,
 * see `AuthService.permissions`) against the permission(s) declared on the
 * route's `data`. Unauthenticated users are sent to login; authenticated
 * users missing the required permission are sent to the "no access" page.
 *
 * Route data contract — declare ONE of the following on the route:
 *   data: { permission: 'User.Create' }        // must have this permission
 *   data: { permissions: ['User.Edit', ...] }  // must have at least one
 *
 * Usage:
 *   {
 *     path: 'users/add',
 *     canActivate: [authGuard, permissionGuard],
 *     data: { permission: 'User.Create' },
 *     loadComponent: () => import('./user-form').then(m => m.UserForm),
 *   }
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(["/login"]);
  }

  const requiredPermission = route.data["permission"] as string | undefined;
  const requiredPermissions = route.data["permissions"] as string[] | undefined;

  // No permission requirement declared ⇒ authentication alone is enough.
  if (!requiredPermission && !requiredPermissions?.length) {
    return true;
  }

  const allowed = requiredPermission
    ? authService.hasPermission(requiredPermission)
    : authService.hasAnyPermission(requiredPermissions ?? []);

  if (allowed) {
    return true;
  }

  // Redirect *into the same top-level section* (e.g. "/main/no-access" for
  // a route under "/main") rather than the standalone "/no-access" page —
  // this keeps that section's layout (sidebar/header) mounted and only
  // swaps the content area to the no-access state. Falls back to the
  // top-level "/no-access" route for anything outside a known section.
  const [, sectionSegment] = state.url.split("/");
  const knownSections = ["main"];

  if (sectionSegment && knownSections.includes(sectionSegment)) {
    return router.createUrlTree([`/${sectionSegment}/no-access`]);
  }

  return router.createUrlTree(["/no-access"]);
};
