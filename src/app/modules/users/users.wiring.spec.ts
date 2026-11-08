import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { NAV_SECTIONS } from "../../layout/main-layout/nav.config";
import { MAIN_ROUTES } from "../main.routes";
import { UsersList } from "./pages/users-list/users-list";

describe("Users wiring", () => {
  it("routes /main/users behind the User.View guard, with a breadcrumb", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "users")!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({
      permission: PERMISSIONS.User.View,
      breadcrumb: "LAYOUT.NAV.USERS",
    });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(UsersList);
  });

  it("adds a sidebar item in the Access section guarded by the same permission", () => {
    const item = NAV_SECTIONS.find((s) => s.id === "access")!.items.find((i) => i.id === "users");
    expect(item).toMatchObject({
      labelKey: "LAYOUT.NAV.USERS",
      route: "/main/users",
      permission: PERMISSIONS.User.View,
    });
    expect(item!.icon).toMatch(/^pi pi-/);
  });
});
