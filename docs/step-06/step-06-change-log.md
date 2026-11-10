# Step 06 — Fixes and Hardening: Change Log

Scope: your two decisions after Step 05 (remove the dashboard for now; treat API responses as matching the Angular models until you report a difference) plus the roadmap's Step 06 items that were already confirmed in code. Items that depend on your manual QA results were **not** touched.

## What changed

| Area | Change |
|---|---|
| **Dashboard removed (your decision)** | Deleted `modules/dashboard` (page, service, API + mock repositories, token), its route, sidebar item ("overview" section), DI entries (10 repository tokens remain) and its translations (`DASHBOARD.*`, `LAYOUT.NAV.DASHBOARD`: 29 keys per language). The leading "Dashboard" breadcrumb that pointed to it is gone from every trail. `/main` now runs `homeRedirectGuard`: it sends the user to the first sidebar item they can open (same rule as the sidebar), or to their profile. README updated, including how to bring the dashboard back when the API exists. |
| **Angular patch (M5, D14 A)** | `@angular/*` 21.2.17 → **21.2.26**, `@angular/build` / `cli` → **21.2.29**. Production-dependency audit: **7 → 0 vulnerabilities**; whole tree 58 → 40 (all dev tooling). The Angular packages pin each other's versions exactly, so npm could not move them one by one: I raised the floors in `package.json` (`^21.2.26` / `^21.2.29`) and installed with `--force`; `npm ls` reports no invalid or missing peers. |
| **Validation labels (S5-02)** | 12 API field names (`Email`, `CountryCode`, `PhoneNumber`, `Password`, `PasswordConfirmation`, `CurrentPassword`, `NewPassword`, `NewPasswordConfirmation`, `RoleId`, `Permissions`, `Code`, `Token`) now have EN + AR labels, so validation toasts no longer show English field names in the Arabic UI. |
| **Delete stranding (S5-04)** | Users and Roles services step back one page when a delete empties the current page (same behaviour Chairs/Barbers already had). |
| **BA-03** | Barber phone validator rejects letters/symbols instead of silently stripping them (separators `space + - . ( )` still accepted). |
| **BR-02** | Branch mapper tolerates a null map link (matches the URL validator). |
| **CH-05** | Chair mock repository rejects an out-of-range type on create and update (new key `CHAIRS.ERRORS.TYPE_INVALID`, EN + AR). |

## Tests (+75 net; 4 defect pins left)

New specs: `home-redirect.guard`, `i18n-files` (key parity, placeholders, API field labels), `service-api.repository`, `sidebar` (visibility by permission, active item), and the five auth pages: `login` (incl. unsafe `returnUrl`), `forget-password`, `email-verification` (auto-verify, paste, resend countdown, single-use code not sent twice), `create-new-password` (link validation, policy, strength), `password-success`. Added remove-stepback cases to the Users/Roles service specs. Three more `it.fails` pins now pass and became normal tests (BA-03 ×3, BR-02, CH-05).

## Verification

| Check | Result |
|---|---|
| Tests | **108 files, 1423 passed, 4 expected fail** (Step 04 delivery: 99 / 1343 / 9) |
| `tsc` app / spec | clean / clean |
| ESLint, Prettier | 0 errors, 0 warnings / clean |
| `check:providers` | OK (10 tokens in both files, no mock references in prod) |
| Development build | OK |
| Production build (`npm run build`, the Vercel command) | OK; `check:prod-bundle` OK; `useMock:!1`, `showDesignSystem:!1`; real API URL present; no dashboard code in the bundle |
| `build:template-brand` | OK; `check:prod-bundle` OK; template brand applied (`Brand Name` present, `Odel Salon` absent) |
| `npm audit --omit=dev` | **0 vulnerabilities** |

## Not done, and why

1. **Everything that depends on your QA results** (Step 05 checklist) — no runtime fix was guessed. This includes S5-05 (`Id` in the Barbers/Offers multipart update) and any contract difference you report.
2. **BR-03** (same open/close time) — waits for your business rule (D13). **XM-01 / XM-02** (mock data denormalisation) — deferred with D4's mock sub-question. These are the 4 remaining expected-fail pins.
3. **Hard-coded hex colours (R-23)** — not touched: I can't check colours in a browser, and a wrong token swap would be invisible to the tests.
4. **Unused translation keys (S5-03, ~16)** — left in place; some may be built dynamically and removing them without a browser pass isn't worth the risk.
5. **`PERMISSIONS` lazy-read root cause (N11)** — still not investigated.
6. **HTML template formatting** — still excluded from Prettier until QA confirms spacing.
7. **Angular `--force` install** — no invalid peers reported, but if a future plain `npm install` complains, the fix is to bump the Angular packages together to the same version.
8. Nothing was verified in a browser or against the real API.
