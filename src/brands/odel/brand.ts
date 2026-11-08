/**
 * Brand identity (build-time).
 *
 * The runtime counterpart of brands/odel/_brand.scss. Swapped per client
 * through angular.json `fileReplacements` (see the `brand-template`
 * configuration). Nothing in the app hardcodes the salon name, logo or
 * support contact — it all reads from BRAND.
 */
export interface BrandConfig {
  /** Full brand name, shown in <title>, auth screen and emails. */
  readonly name: string;
  /** Short name for the collapsed sidebar / app switcher. */
  readonly shortName: string;
  /** Arabic rendering of the name (the wordmark swaps with the UI language). */
  readonly nameAr: string;
  /** Square mark used in the sidebar, favicon-like places. */
  readonly logoMark: string;
  /** Meta theme-color for mobile browser chrome. */
  readonly themeColor: string;
  readonly supportEmail: string;
  readonly copyrightHolder: string;
}

export const BRAND: BrandConfig = {
  name: "Odel Salon",
  shortName: "Odel",
  nameAr: "أوديل صالون",
  logoMark: "assets/brand/logo-mark.svg",
  themeColor: "#141311",
  supportEmail: "support@odel-salon.com",
  copyrightHolder: "Odel Salon",
};
