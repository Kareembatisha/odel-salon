import { DestroyRef, Injectable, inject, signal } from "@angular/core";

/**
 * SidebarService
 *
 * Single source of truth for the main-layout sidebar's collapsed state.
 * Shared between the header (toggle button) and the sidebar itself,
 * which are siblings inside MainLayout — a signal in a root service is
 * the simplest way to keep them in sync without an @Output round-trip.
 *
 * Also auto-collapses to the icon rail on tablet-landscape widths (see
 * TABLET_COLLAPSE_MIN/MAX below) so the header never has to squeeze its
 * full-width content next to a full-width sidebar in a viewport too
 * narrow for both.
 */

// Kept in sync with sidebar.scss/header.scss ($bp-lg / $bp-xl):
//   <= 900px    -> off-canvas overlay (Sidebar component's own isMobile logic;
//                  the `collapsed` flag doesn't matter, full width is always used).
//   901–1280px  -> "tablet landscape": the sidebar stays in normal flow (not an
//                  overlay) but a *full* 264px sidebar plus the header's full-width
//                  content (search box, breadcrumb, profile name...) don't both fit —
//                  that's the gap that used to overflow. Auto-collapsing to the
//                  76px icon rail here frees up ~190px for the header/content.
//   > 1280px    -> plenty of room, auto-expand back out.
const TABLET_COLLAPSE_MIN = 901;
const TABLET_COLLAPSE_MAX = 1280;

@Injectable({ providedIn: "root" })
export class SidebarService {
  private readonly _collapsed = signal(false);
  readonly collapsed = this._collapsed.asReadonly();

  // Mobile / tablet only: the sidebar is rendered as an off-canvas overlay
  // that is hidden by default and slid in on demand. Independent from
  // `collapsed`, which drives the icon-rail state on desktop.
  private readonly _mobileOpen = signal(false);
  readonly mobileOpen = this._mobileOpen.asReadonly();

  constructor() {
    if (typeof window === "undefined") return;

    const categoryOf = (width: number): "tablet" | "wide" | "other" => {
      if (width >= TABLET_COLLAPSE_MIN && width <= TABLET_COLLAPSE_MAX) return "tablet";
      if (width > TABLET_COLLAPSE_MAX) return "wide";
      return "other"; // off-canvas territory — collapsed is irrelevant there
    };

    // Tracks the last width *band*, not the last exact width — so a
    // manual toggle() while inside the tablet band survives further
    // resize events that stay within that same band (e.g. a window drag
    // continuing, DevTools opening, a zoom change), and auto-collapse
    // only re-fires on a genuine crossing into/out of the band.
    let previousCategory: "tablet" | "wide" | "other" | null = null;

    const applyForWidth = (width: number): void => {
      const category = categoryOf(width);
      if (category === previousCategory) return;
      previousCategory = category;

      if (category === "tablet") {
        this._collapsed.set(true);
      } else if (category === "wide") {
        this._collapsed.set(false);
      }
    };

    applyForWidth(window.innerWidth);
    const onResize = () => applyForWidth(window.innerWidth);
    window.addEventListener("resize", onResize);

    inject(DestroyRef).onDestroy(() => window.removeEventListener("resize", onResize));
  }

  toggle(): void {
    this._collapsed.update((v) => !v);
  }

  collapse(): void {
    this._collapsed.set(true);
  }

  expand(): void {
    this._collapsed.set(false);
  }

  toggleMobile(): void {
    this._mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this._mobileOpen.set(false);
  }
}
