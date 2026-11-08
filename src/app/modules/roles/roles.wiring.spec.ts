import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { NAV_SECTIONS } from "../../layout/main-layout/nav.config";
import { MAIN_ROUTES } from "../main.routes";
import { RoleDetails } from "./pages/role-details/role-details";
import { RolesList } from "./pages/roles-list/roles-list";

describe("Roles wiring", () => {
  it("routes /main/roles behind the Role.View guard, with a breadcrumb", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "roles")!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({
      permission: PERMISSIONS.Role.View,
      breadcrumb: "LAYOUT.NAV.ROLES_PERMISSIONS",
    });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(RolesList);
  });

  it("routes /main/roles/:id behind the same guard, with a two-level breadcrumb", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "roles/:id")!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({
      permission: PERMISSIONS.Role.View,
      breadcrumb: ["LAYOUT.NAV.ROLES_PERMISSIONS", "ROLES.DETAILS.BREADCRUMB"],
    });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(RoleDetails);
  });

  it("adds a sidebar item in the Access section guarded by the same permission", () => {
    const item = NAV_SECTIONS.find((s) => s.id === "access")!.items.find((i) => i.id === "roles");
    expect(item).toMatchObject({
      labelKey: "LAYOUT.NAV.ROLES_PERMISSIONS",
      route: "/main/roles",
      permission: PERMISSIONS.Role.View,
    });
    expect(item!.icon).toMatch(/^pi pi-/);
  });
});
