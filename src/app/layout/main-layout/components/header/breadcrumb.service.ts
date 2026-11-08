import { Injectable, inject, signal } from "@angular/core";
import { ActivatedRouteSnapshot, NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";

export interface BreadcrumbItem {
  /** Translation key (or plain text for dynamic names, e.g. a branch name). */
  label: string;
  route?: string;
  isActive?: boolean;
}

/**
 * BreadcrumbService
 *
 * Builds the trail automatically after every navigation from route `data`:
 *   data: { breadcrumb: 'LAYOUT.NAV.BRANCHES' }                       → Dashboard / Branches
 *   data: { breadcrumb: ['LAYOUT.NAV.SETTINGS', 'LAYOUT.NAV.USERS'] } → Dashboard / Settings / Users
 * (earlier entries of an array are group labels without a link.)
 *
 * A page with a dynamic name (e.g. "Edit Downtown branch") can still call
 * setBreadcrumbs() after load to override the automatic trail.
 */
@Injectable({ providedIn: "root" })
export class BreadcrumbService {
  private readonly router = inject(Router);
  private readonly _breadcrumbs = signal<BreadcrumbItem[]>([]);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.setBreadcrumbs(this.fromRoute(this.router.routerState.snapshot.root)));
  }

  getBreadcrumbs() {
    return this._breadcrumbs.asReadonly();
  }

  setBreadcrumbs(items: BreadcrumbItem[]): void {
    this._breadcrumbs.set(
      items.map((item, index) => ({ ...item, isActive: index === items.length - 1 })),
    );
  }

  clearBreadcrumbs(): void {
    this._breadcrumbs.set([]);
  }

  private fromRoute(root: ActivatedRouteSnapshot): BreadcrumbItem[] {
    const trail: BreadcrumbItem[] = [];
    let url = "";
    let node: ActivatedRouteSnapshot | null = root;

    while (node) {
      const segment = node.url.map((s) => s.path).join("/");
      if (segment) url += `/${segment}`;

      const data = node.routeConfig?.data?.["breadcrumb"] as string | string[] | undefined;
      if (data) {
        const labels = Array.isArray(data) ? data : [data];
        labels.forEach((label, i) =>
          trail.push({ label, route: i === labels.length - 1 ? url : undefined }),
        );
      }
      node = node.firstChild;
    }

    // Everything under /main hangs off the dashboard.
    const isDashboard = trail.length === 1 && trail[0].route === "/main";
    if (trail.length && !isDashboard)
      trail.unshift({ label: "LAYOUT.NAV.DASHBOARD", route: "/main" });
    return trail;
  }
}
