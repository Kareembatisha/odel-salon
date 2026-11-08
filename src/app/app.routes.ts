import { Routes } from "@angular/router";

import { authGuard, guestGuard } from "./core/guards/auth.guard";

export const routes: Routes = [
  // Auth shell (login, forgot password, OTP…) — only for signed-out visitors.
  {
    path: "",
    canActivate: [guestGuard],
    loadComponent: () => import("./layout/auth-layout/auth-layout").then((m) => m.AuthLayout),
    loadChildren: () => import("./modules/auth/auth.routes").then((m) => m.AUTH_ROUTES),
  },

  // Admin shell (sidebar + header) — requires a session.
  {
    path: "main",
    canActivate: [authGuard],
    loadComponent: () => import("./layout/main-layout/main-layout").then((m) => m.MainLayout),
    loadChildren: () => import("./modules/main.routes").then((m) => m.MAIN_ROUTES),
  },

  // "No access" (403) — also reachable from inside /main (see permission.guard.ts).
  {
    path: "no-access",
    loadComponent: () => import("./modules/no-access/no-access").then((m) => m.NoAccess),
  },

  // Wildcard — must be last.
  {
    path: "**",
    loadComponent: () => import("./modules/not-found/not-found").then((m) => m.NotFound),
  },
];
