import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { NAV_SECTIONS } from "../../layout/main-layout/nav.config";
import { MAIN_ROUTES } from "../main.routes";
import { CustomerProfilePage } from "./pages/customer-profile/customer-profile";
import { CustomersList } from "./pages/customers-list/customers-list";

describe("Customers wiring", () => {
  it("adds Customers to the Bookings sidebar section, behind Customer.View", () => {
    const section = NAV_SECTIONS.find((s) => s.id === "bookings")!;
    const item = section.items.find((i) => i.id === "customers");

    expect(item).toMatchObject({
      labelKey: "LAYOUT.NAV.CUSTOMERS",
      route: "/main/customers",
      permission: PERMISSIONS.Customer.View,
    });
    expect(item!.icon).toMatch(/^pi pi-/);
  });

  it("routes /main/customers behind Customer.View, with a breadcrumb", () => {
    const route = MAIN_ROUTES.find((r) => r.path === "customers");

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({
      permission: PERMISSIONS.Customer.View,
      breadcrumb: "LAYOUT.NAV.CUSTOMERS",
    });
  });

  it("lazy-loads the customers list", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "customers")!;

    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(CustomersList);
  });

  it("routes /main/customers/:id behind Customer.View, with the profile breadcrumb trail", () => {
    const route = MAIN_ROUTES.find((r) => r.path === "customers/:id");

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({
      permission: PERMISSIONS.Customer.View,
      breadcrumb: ["LAYOUT.NAV.CUSTOMERS", "CUSTOMERS.PROFILE.BREADCRUMB"],
    });
  });

  it("lazy-loads the customer profile", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "customers/:id")!;

    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(CustomerProfilePage);
  });

  it("has a Customer.View permission in the catalog", () => {
    expect(PERMISSIONS.Customer.View).toBe("Customer.View");
  });
});
