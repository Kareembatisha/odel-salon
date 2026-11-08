import { PERMISSIONS, Permission } from "@core/auth/permissions";
import { environment } from "@env/environment";

export interface NavItem {
  id: string;
  /** Translation key. */
  labelKey: string;
  /** PrimeIcons class. */
  icon: string;
  route?: string;
  /**
   * The permission that already guards this item's route (see modules/main.routes.ts).
   * The sidebar hides items the user can't open; the route guard stays the real boundary.
   */
  permission?: Permission;
  children?: NavItem[];
}

export interface NavSection {
  id: string;
  /** Translation key for the section label (omit for an unlabeled section). */
  labelKey?: string;
  items: NavItem[];
  /** Pinned to the bottom of the sidebar. */
  pinnedBottom?: boolean;
}

/**
 * Sidebar structure. Only sections that exist are listed — add an item here
 * in the same change that adds its route (modules/main.routes.ts).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    items: [
      { id: "dashboard", labelKey: "LAYOUT.NAV.DASHBOARD", icon: "pi pi-th-large", route: "/main" },
    ],
  },
  {
    id: "access",
    labelKey: "LAYOUT.SECTIONS.ACCESS",
    items: [
      {
        id: "users",
        labelKey: "LAYOUT.NAV.USERS",
        icon: "pi pi-users",
        route: "/main/users",
        permission: PERMISSIONS.User.View,
      },
      {
        id: "roles",
        labelKey: "LAYOUT.NAV.ROLES_PERMISSIONS",
        icon: "pi pi-shield",
        route: "/main/roles",
        permission: PERMISSIONS.Role.View,
      },
    ],
  },
  {
    id: "salon",
    labelKey: "LAYOUT.SECTIONS.SALON",
    items: [
      {
        id: "branches",
        labelKey: "LAYOUT.NAV.BRANCHES",
        icon: "pi pi-building",
        route: "/main/branches",
        permission: PERMISSIONS.Branch.View,
      },
      {
        id: "chairs",
        labelKey: "LAYOUT.NAV.CHAIRS",
        icon: "pi pi-stop",
        route: "/main/chairs",
        permission: PERMISSIONS.Chair.View,
      },
      {
        id: "barbers",
        labelKey: "LAYOUT.NAV.BARBERS",
        icon: "pi pi-id-card",
        route: "/main/barbers",
        permission: PERMISSIONS.Barber.View,
      },
      {
        id: "services",
        labelKey: "LAYOUT.NAV.SERVICES",
        icon: "pi pi-list",
        route: "/main/services",
        permission: PERMISSIONS.Service.View,
      },
      {
        id: "packages",
        labelKey: "LAYOUT.NAV.PACKAGES",
        icon: "pi pi-box",
        route: "/main/packages",
        permission: PERMISSIONS.Package.View,
      },
      {
        id: "offers",
        labelKey: "LAYOUT.NAV.OFFERS",
        icon: "pi pi-percentage",
        route: "/main/offers",
        permission: PERMISSIONS.Offer.View,
      },
    ],
  },
  // Developer reference — never shipped to production (environment.showDesignSystem = false).
  ...(environment.showDesignSystem
    ? [
        {
          id: "developer",
          labelKey: "LAYOUT.SECTIONS.DEVELOPER",
          pinnedBottom: true,
          items: [
            {
              id: "design-system",
              labelKey: "LAYOUT.NAV.DESIGN_SYSTEM",
              icon: "pi pi-palette",
              route: "/main/design-system",
            },
          ],
        } satisfies NavSection,
      ]
    : []),
];
