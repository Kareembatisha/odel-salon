# Step 04 — Logic-Flow Alignment: Change Log

Scope: the Step 04 items of the approved roadmap (R-01, R-05, R-07, R-08, R-09, R-10, R-11, R-12, R-16, R-17 and the Users/Roles tests). Excel/Print export stays removed; `exceljs`, `file-saver` and `@types/file-saver` were not reintroduced. Mocks remain available for development and tests. **Not started:** Step 05.

## What changed

| ID | Change |
|---|---|
| **R-01 / D4** | Every repository is now an injection token — added `USER_`, `ROLE_`, `DASHBOARD_`, `PROFILE_` and `AUTH_REPOSITORY`; the five services only `inject(TOKEN)`. All 11 tokens are registered in `src/app/app.providers.ts` (dev/tests: `environment.useMock` picks mock or API). The `production` and `production-brand-template` configurations **replace that file** with `app.providers.prod.ts` (API repositories only, no mock import). The mock login and mock data are therefore absent from production bundles. `app.config.ts` just spreads `DATA_PROVIDERS`. |
| R-01 checks | `npm run check:providers` (both files list the same 11 tokens, prod has no mock references, angular.json swaps the file in for both production-like configurations) and `npm run check:prod-bundle` (fails if a bundle contains mock markers or `useMock` is true; proven to fail on a development build). `tsconfig.app.json` lists the prod providers file so it is type-checked. |
| **R-05** | Users and Roles services: `requestId` + unsubscribe stale-response guard on `load()`, `status:false` treated as failure in mutations and in `getUser` / `getRole`. |
| **R-07** | All 9 mutating services: `saving` is now `computed(pendingMutations() > 0)` — an in-flight counter instead of a boolean. Fixes BA-04, CH-03, BR-04. |
| **R-08** | Every mutating list-page handler starts with its permission check (`openCreate`, `toggle`, `askDelete`, `askBulkDelete`, `confirmDelete`, `openRename`, branch navigation, services bulk/toggle); `toggle` and `confirmDelete` also ignore clicks while saving. Chairs/Offers toggle use `canToggle`, the rest `canEdit`. Fixes BA-05, CH-04. |
| **D6 A** | `*appCan` replaced by `@if (canCreate())` in Users and Roles; the now-unused `HasPermissionDirective` was deleted. |
| **R-10** | New `shared/validators/text.validators.ts` (`notBlank`, `maxTrimmedLength`) replaces four copies and is used by every name field (chairs, packages, offers, barbers, users, roles, branches, services): whitespace-only is rejected and the length limit applies to the trimmed text. `saving` guard in the Barber, User and Role forms. `RoleForm` seeds in `ngOnInit` (no more `queueMicrotask`). Chair form pre-selects the filtered branch when the options arrive late (CH-02), never over a value the user chose. Fixes BA-01, BA-02, CH-01, CH-02, BR-01 (and the same class in Users/Roles/Services). |
| **R-11** | No-op search guard in Barbers, Users, Roles (BA-06); deleting rows removes only those ids from the selection (BA-07, also Services/Users/Roles); `drawerToken` + `closeDrawer()` in Users; all 13 non-null assertions in non-test code removed (ESLint rule is now an **error**). |
| **R-09 / D2 B** | `CARD_PAGE_SIZE = 12` and `TABLE_PAGE_SIZE = 10` in `shared/model/pagination.constants.ts`; Services keeps 20 as a documented exception. |
| **R-16 / D5 A** | Users/Roles aligned: `createUser`/`updateUser`/`createRole`, `Create/UpdateUserPayload`, repository `getUserById`/`getRoleById`/`toggleUserStatus`. `rename` / `savePermissions` keep their domain names (documented exception). |
| **R-12** | Branch navigations use absolute `/main/…` paths. |

## Tests

| Area | Added |
|---|---|
| Users / Roles | `users.service.spec` (17), `roles.service.spec` (16), `user-form.spec` (13), `role-form.spec` (7), `users-list.spec` and `roles-list.spec` (handler permissions, stale details, selection, saving guards) |
| Auth / guards / interceptors | `auth.service.spec` (30: session restore, login, logout, refresh, password flows, helpers, cross-tab sync), `guards.spec` (auth, guest incl. unsafe `returnUrl`, permission), `token.interceptor.spec`, `return-url.util.spec` |
| Providers | `app.providers.spec` (11 tokens, API only) |
| Shared | `text.validators.spec` |
| Existing pins | 16 `it.fails` defect pins (25 → 9) now pass and became normal tests: BA-01, 02, 04, 05×2, 06, 07; CH-01, 02, 03, 04×2; BR-01×3; BR-04; 3 branches-list assertions updated for the absolute nav paths |

## Verification

| Check | Result |
|---|---|
| Full test suite | **99 files, 1341 passed, 9 expected fail** (was 87 / 1154 / 25 at the end of Step 03) |
| `tsc` app / spec configs | clean / clean |
| ESLint (non-null assertions now an error) | 0 errors, 0 warnings |
| Prettier check | clean |
| `check:providers` | OK |
| Development build | OK (mock repositories present, as intended) |
| Production build | OK, no warnings; `check:prod-bundle` OK (86 JS files, no mock code); `useMock:!1`, `production:!0`, `showDesignSystem:!1` |
| `build:template-brand` | OK; `check:prod-bundle` OK; same flags; template brand applied (`Brand Name` present, `Odel Salon` absent). Default production build still has `Odel Salon` |
| Mock providers in production | none: the production providers file contains only API repositories (`app.providers.spec`, `check:providers`) |
| Mock code in the production bundle | none (`check:prod-bundle`; before this step the mock login and mock data were in the initial bundle) |

## Remaining issues and limits

1. **Not done / out of Step 04:** R-15 — **cancelled**, see the addendum (PascalCase confirmed); R-14 remainder (Packages/Services repository specs, Services/Packages parity); BR-02, BR-03 (D13), CH-05, XM-01, XM-02; HTML formatting (waits for Step 05 browser QA); Angular patch (Step 06).
2. **Still 9 `it.fails` pins** (CH-05, XM-01, XM-02, BR-02, BR-03, one more branches pin, 3 phone-format cases in barbers): backend/mock/decision items, unchanged.
3. **Auth pages and layout** (6 pages, header/sidebar) and extra `error.interceptor` cases are still untested; the service, guards, token interceptor and return-URL util are now covered.
4. **Users/Roles delete does not step back a page** when it empties the current page (`reloadAfterRemoval` exists in the Chairs-shaped services only); not in this step's scope.
5. `ng test` builds with the default **production** configuration, so unit tests resolve `environment.prod.ts` and the production providers. Not changed; documented in the README.
6. Email and phone fields in the User form still reject surrounding spaces (they are validated untrimmed, trimmed on submit); left as is.
7. Nothing was verified in a browser or against a real API.

## Addendum (after delivery): real API alignment

| Change | Detail |
|---|---|
| **D3 resolved = A** | The real API's Swagger requests show PascalCase for every Users/Roles query param (`RoleId`, `Status`, `PageNumber`, `PageSize`, `Search`, `IncludePermissions`). Code and specs already match; R-15 is cancelled. |
| **Base URL** | `apiUrl` is now `https://api-odel.subhe.site/api/v1` in both `environment.ts` and `environment.prod.ts` (the production bundle contains it; the old placeholder is gone). |
| **Role details response** | `GET /roles/{id}` returns the permission matrix as **`modules`**, not `permissions`. `RoleDetails.modules` replaces `permissions` (model, `role-details` page including the rename path, mock repository). `enabledValues()` tolerates a missing matrix. Tests added: API-repository response shape and the missing-matrix case. Applied as patches on top of the Step 04 code; the rest of your `roles.zip` matched the Step 03 module and its stray `components/role-form.ts` duplicate was not taken. |
| **`vercel.json`** | Added at the project root as provided (LF line endings): `npm run build`, output `dist/odel-salon-admin/browser` (matches the Angular output path), SPA rewrite to `/index.html`. |

Verification after the addendum: tests 99 files / **1343 passed** / 9 expected fail; ESLint and Prettier clean; `check:providers` OK; development, production and `build:template-brand` builds OK; `check:prod-bundle` OK for both production-like builds. Not verified: the live API itself (I can't call it from here), or the app in a browser.
