import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { NAV_SECTIONS } from "../../layout/main-layout/nav.config";
import { MAIN_ROUTES } from "../main.routes";
import { BookingDetailsPage } from "./pages/booking-details/booking-details";
import { PaymentReviewsPage } from "../payment-reviews/pages/payment-reviews/payment-reviews";
import { BookingsList } from "./pages/bookings-list/bookings-list";

describe("Bookings wiring", () => {
  it("routes /main/bookings behind the Booking.View permission guard, with a breadcrumb", () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings");

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({
      permission: PERMISSIONS.Booking.View,
      breadcrumb: "LAYOUT.NAV.BOOKINGS",
    });
    expect(route!.loadComponent).toBeTypeOf("function");
  });

  it("lazy-loads the bookings list page", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings")!;
    const component = await (route.loadComponent as () => Promise<unknown>)();

    expect(component).toBe(BookingsList);
  });

  it("adds a Bookings sidebar section: Bookings and Payment reviews (Booking.View), then Customers (Customer.View)", () => {
    const section = NAV_SECTIONS.find((s) => s.id === "bookings");

    expect(section).toBeDefined();
    expect(section!.labelKey).toBe("LAYOUT.SECTIONS.BOOKINGS");
    expect(section!.items).toEqual([
      expect.objectContaining({
        id: "bookings",
        labelKey: "LAYOUT.NAV.BOOKINGS",
        route: "/main/bookings",
        permission: PERMISSIONS.Booking.View,
      }),
      expect.objectContaining({
        id: "payment-reviews",
        labelKey: "LAYOUT.NAV.PAYMENT_REVIEWS",
        route: "/main/bookings/payment-reviews",
        permission: PERMISSIONS.Booking.View,
      }),
      expect.objectContaining({
        id: "customers",
        labelKey: "LAYOUT.NAV.CUSTOMERS",
        route: "/main/customers",
        permission: PERMISSIONS.Customer.View,
      }),
    ]);
    for (const item of section!.items) expect(item.icon).toMatch(/^pi pi-/);
  });

  it("routes /main/bookings/payment-reviews behind Booking.View, with its breadcrumb trail", () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings/payment-reviews");

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({
      permission: PERMISSIONS.Booking.View,
      breadcrumb: ["LAYOUT.NAV.BOOKINGS", "PAYMENT_REVIEWS.BREADCRUMB"],
    });
  });

  it("lazy-loads the payment reviews page", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings/payment-reviews")!;
    const component = await (route.loadComponent as () => Promise<unknown>)();

    expect(component).toBe(PaymentReviewsPage);
  });

  it("declares payment-reviews before bookings/:id, so `:id` can't swallow it", () => {
    const paths = MAIN_ROUTES.map((r) => r.path);

    expect(paths.indexOf("bookings/payment-reviews")).toBeGreaterThan(-1);
    expect(paths.indexOf("bookings/payment-reviews")).toBeLessThan(paths.indexOf("bookings/:id"));
  });

  it("puts Bookings after the Salon section and before the pinned developer links", () => {
    const ids = NAV_SECTIONS.map((s) => s.id);

    expect(ids.indexOf("bookings")).toBeGreaterThan(ids.indexOf("salon"));
    const pinned = NAV_SECTIONS.findIndex((s) => s.pinnedBottom);
    if (pinned !== -1) expect(ids.indexOf("bookings")).toBeLessThan(pinned);
  });

  it("keeps every route behind a permission guard with a permission that exists", () => {
    const booking = MAIN_ROUTES.filter((r) => r.path?.startsWith("bookings"));

    for (const route of booking) {
      expect(route.canActivate).toHaveLength(1);
      expect(String((route.data as { permission: string }).permission)).toMatch(/^Booking\./);
    }
  });

  it("routes /main/bookings/:id behind Booking.View, with the details breadcrumb", () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings/:id");

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({
      permission: PERMISSIONS.Booking.View,
      breadcrumb: ["LAYOUT.NAV.BOOKINGS", "BOOKINGS.DETAILS.BREADCRUMB"],
    });
  });

  it("lazy-loads the booking details page", async () => {
    const route = MAIN_ROUTES.find((r) => r.path === "bookings/:id")!;
    const component = await (route.loadComponent as () => Promise<unknown>)();

    expect(component).toBe(BookingDetailsPage);
  });

  it("declares every static bookings/* route BEFORE bookings/:id (or `:id` would swallow it)", () => {
    const paths = MAIN_ROUTES.map((r) => r.path);
    const param = paths.indexOf("bookings/:id");

    expect(param).toBeGreaterThan(-1);
    paths.forEach((path, index) => {
      if (path?.startsWith("bookings/") && path !== "bookings/:id") {
        expect(index, `${path} must come before bookings/:id`).toBeLessThan(param);
      }
    });
  });

  it("gives the details page no sidebar item of its own (the Bookings item stays active)", () => {
    const routes = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.route ?? ""));

    expect(routes).toContain("/main/bookings");
    expect(routes).not.toContain("/main/bookings/:id");
    expect(routes.filter((r) => r.startsWith("/main/bookings/"))).toEqual([
      "/main/bookings/payment-reviews",
    ]);
  });
});
