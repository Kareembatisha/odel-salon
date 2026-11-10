import { Provider } from "@angular/core";
import { describe, expect, it } from "vitest";

import { DATA_PROVIDERS } from "./app.providers";

type ClassProvider = { provide: { _desc: string }; useClass: { name: string } };
const asClass = (p: Provider) => p as unknown as ClassProvider;

/**
 * NOTE: `ng test` builds with the default (production) configuration, so `./app.providers`
 * resolves to `app.providers.prod.ts` here — which is exactly the file these tests should pin.
 * The development file and its parity with the production one are checked by
 * `npm run check:providers` (scripts/check-providers.mjs), because the build swaps the module.
 */
describe("production repository providers", () => {
  it("register one provider for each of the 10 repository tokens", () => {
    const tokens = DATA_PROVIDERS.map((p) => asClass(p).provide._desc);

    expect(new Set(tokens).size).toBe(10);
    expect([...tokens].sort()).toEqual(
      [
        "AUTH_REPOSITORY",
        "BARBER_REPOSITORY",
        "BRANCH_REPOSITORY",
        "CHAIR_REPOSITORY",
        "OFFER_REPOSITORY",
        "PACKAGE_REPOSITORY",
        "PROFILE_REPOSITORY",
        "ROLE_REPOSITORY",
        "SERVICE_REPOSITORY",
        "USER_REPOSITORY",
      ].sort(),
    );
  });

  it("use API repositories only — never a mock", () => {
    for (const p of DATA_PROVIDERS) {
      expect(asClass(p).useClass.name).toMatch(/ApiRepository$/);
    }
  });
});
