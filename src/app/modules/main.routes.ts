import { Routes } from "@angular/router";

import { environment } from "@env/environment";
import { permissionGuard } from "../core/guards/permission.guard";
import { PERMISSIONS } from "../core/auth/permissions";

/**
 * Every route under /main. Add a feature here together with its sidebar item
 * (layout/main-layout/nav.config.ts) and its permission (core/auth/permissions.ts).
 */
export const MAIN_ROUTES: Routes = [
  {
    path: "",
    pathMatch: "full",
    // Sign-in is enough: the backend does not (yet) grant a Dashboard permission.
    data: { breadcrumb: "LAYOUT.NAV.DASHBOARD" },
    loadComponent: () =>
      import("./dashboard/pages/dashboard/dashboard").then((m) => m.Dashboard),
  },

  // ── Access control ───────────────────────────────────
  {
    path: "users",
    canActivate: [permissionGuard],
    data: { permission: PERMISSIONS.User.View, breadcrumb: "LAYOUT.NAV.USERS" },
    loadComponent: () =>
      import("./users/pages/users-list/users-list").then((m) => m.UsersList),
  },
  {
    path: "roles",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Role.View,
      breadcrumb: "LAYOUT.NAV.ROLES_PERMISSIONS",
    },
    loadComponent: () =>
      import("./roles/pages/roles-list/roles-list").then((m) => m.RolesList),
  },
  {
    path: "roles/:id",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Role.View,
      breadcrumb: ["LAYOUT.NAV.ROLES_PERMISSIONS", "ROLES.DETAILS.BREADCRUMB"],
    },
    loadComponent: () =>
      import("./roles/pages/role-details/role-details").then(
        (m) => m.RoleDetails,
      ),
  },

  // ── Salon ────────────────────────────────────────────
  {
    path: "branches",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Branch.View,
      breadcrumb: "LAYOUT.NAV.BRANCHES",
    },
    loadComponent: () =>
      import("./branches/pages/branches-list/branches-list").then(
        (m) => m.BranchesList,
      ),
  },

  {
    path: "branches/new",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Branch.Create,
      breadcrumb: "BRANCHES.FORM.CREATE_TITLE",
    },
    loadComponent: () =>
      import("./branches/pages/branches-form/branches-form").then(
        (m) => m.BranchesForm,
      ),
  },
  {
    path: "branches/:id/edit",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Branch.Edit,
      breadcrumb: "BRANCHES.FORM.EDIT_TITLE",
    },
    loadComponent: () =>
      import("./branches/pages/branches-form/branches-form").then(
        (m) => m.BranchesForm,
      ),
  },

  {
    path: "branches/:id",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Branch.View,
      breadcrumb: ["LAYOUT.NAV.BRANCHES", "BRANCHES.DETAILS.BREADCRUMB"],
    },
    loadComponent: () =>
      import("./branches/pages/branch-details/branch-details").then(
        (m) => m.BranchDetails,
      ),
  },

  {
    path: "chairs",
    canActivate: [permissionGuard],
    data: {
      permission: PERMISSIONS.Chair.View,
      breadcrumb: "LAYOUT.NAV.CHAIRS",
    },
    loadComponent: () =>
      import("./chairs/pages/chairs-list/chairs-list").then(
        (m) => m.ChairsList,
      ),
  },

  // ── Account ──────────────────────────────────────────
  {
    path: "profile",
    data: { breadcrumb: "LAYOUT.PROFILE" },
    loadComponent: () =>
      import("./profile-management/pages/profile-view/profile-view").then(
        (m) => m.ProfileView,
      ),
  },

  // Dev-only reference of the design system (hidden from production builds)
  ...(environment.showDesignSystem
    ? [
        {
          path: "design-system",
          data: { breadcrumb: "LAYOUT.NAV.DESIGN_SYSTEM" },
          loadComponent: () =>
            import("./design-system/pages/design-system/design-system").then(
              (m) => m.DesignSystem,
            ),
        },
      ]
    : []),

  // 403 inside the shell (target of permissionGuard)
  {
    path: "no-access",
    data: { breadcrumb: "NO_ACCESS.TITLE" },
    loadComponent: () =>
      import("./no-access/no-access").then((m) => m.NoAccess),
  },

  // Unknown URL under /main
  {
    path: "**",
    data: { breadcrumb: "NOT_FOUND.TITLE", inShell: true },
    loadComponent: () =>
      import("./not-found/not-found").then((m) => m.NotFound),
  },
];
