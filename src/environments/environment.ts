// environment.ts — used by `ng serve` / development builds.
export const environment = {
  production: false,
  apiUrl: "https://api-odel.subhe.site/api/v1",
  /** true → repositories resolve against in-memory mock data (no backend needed). */
  useMock: false,
  /** Shows the Design System reference page under Settings. */
  showDesignSystem: true,
};
