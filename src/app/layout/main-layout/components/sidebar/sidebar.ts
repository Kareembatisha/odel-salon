import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs";
import { TranslateModule } from "@ngx-translate/core";

import { AuthService } from "../../../../modules/auth/service/auth.service";
import { LanguageService } from "@core/services/language.service";
import { BRAND } from "@core/brand/brand";
import { NAV_SECTIONS, NavItem, NavSection } from "../../nav.config";
import { SidebarService } from "./sidebar.service";

// Kept in sync with $bp-lg in the layout SCSS — below this width the sidebar is an
// off-canvas overlay and always renders expanded.
const MOBILE_BREAKPOINT = 900;

/**
 * Sidebar — primary navigation, driven by nav.config.ts.
 * - Sections group related pages; the Settings item expands into sub-pages.
 * - Items the user lacks the permission for are hidden (route guards remain the boundary).
 * - Desktop can collapse to an icon rail; below 900px it is an off-canvas drawer.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-sidebar",
  standalone: true,
  imports: [TranslateModule],
  templateUrl: "./sidebar.html",
  styleUrl: "./sidebar.scss",
})
export class Sidebar {
  protected readonly sidebar = inject(SidebarService);
  protected readonly lang = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly brand = BRAND;

  protected readonly isMobile = signal(
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  );

  @HostListener("window:resize")
  protected onResize(): void {
    this.isMobile.set(window.innerWidth <= MOBILE_BREAKPOINT);
  }

  protected readonly isCollapsedView = computed(() => this.sidebar.collapsed() && !this.isMobile());

  private isVisible(item: NavItem): boolean {
    if (item.children) return item.children.some((c) => this.isVisible(c));
    return !item.permission || this.auth.hasPermission(item.permission);
  }

  /** Sections with only the items (and sub-items) this user may open; empty sections drop out. */
  protected readonly sections = computed<NavSection[]>(() =>
    NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items
        .filter((item) => this.isVisible(item))
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((c) => this.isVisible(c)) }
            : item,
        ),
    })).filter((section) => section.items.length > 0),
  );

  protected readonly topSections = computed(() => this.sections().filter((s) => !s.pinnedBottom));
  protected readonly bottomSections = computed(() => this.sections().filter((s) => s.pinnedBottom));

  private readonly flatItems = NAV_SECTIONS.flatMap((s) =>
    s.items.flatMap((i) => (i.children ? i.children : [i])),
  );

  // Active item derives from the router URL (not clicks) so deep links, refresh,
  // breadcrumbs and back/forward all highlight correctly.
  private readonly navEnd = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    { initialValue: undefined },
  );

  protected readonly activeItemId = computed<string>(() => {
    this.navEnd();
    const url = this.router.url.split("#")[0];
    let best: NavItem | undefined;
    for (const item of this.flatItems) {
      if (!item.route) continue;
      // "/main" is a prefix of every route — only an exact match counts for the dashboard.
      const match =
        item.route === "/main"
          ? url === "/main" || url.startsWith("/main?")
          : url === item.route ||
            url.startsWith(`${item.route}/`) ||
            url.startsWith(`${item.route}?`);
      if (match && (!best || item.route.length > (best.route?.length ?? 0))) best = item;
    }
    return best?.id ?? "";
  });

  protected readonly expandedGroups = signal<Record<string, boolean>>({});

  constructor() {
    // Auto-expand a group when the route lands on one of its children.
    effect(() => {
      const active = this.activeItemId();
      for (const item of this.flatItems) {
        if (item.id !== active) continue;
        const parent = NAV_SECTIONS.flatMap((s) => s.items).find((i) =>
          i.children?.some((c) => c.id === active),
        );
        if (parent) this.expandedGroups.update((g) => ({ ...g, [parent.id]: true }));
      }
    });
  }

  protected isGroupActive(item: NavItem): boolean {
    return !!item.children?.some((c) => c.id === this.activeItemId());
  }

  protected isExpanded(item: NavItem): boolean {
    return !!this.expandedGroups()[item.id];
  }

  protected toggleGroup(item: NavItem): void {
    this.expandedGroups.update((g) => ({ ...g, [item.id]: !g[item.id] }));
  }

  protected go(item: NavItem): void {
    if (!item.route) return;
    this.router.navigateByUrl(item.route);
    this.sidebar.closeMobile();
  }
}
