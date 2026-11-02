// environment.ts — used by `ng serve` / development builds.
export const environment = {
  production: false,
  apiUrl: "https://api.odel-salon.example/api/v1",
  /** true → repositories resolve against in-memory mock data (no backend needed). */
  useMock: true,
  /** Shows the Design System reference page under Settings. */
  showDesignSystem: true,
};
