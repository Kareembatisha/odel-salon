# Step 05 — Static Review (what I could check without a browser)

Scope: read-only. **No source changed.** I cannot open a browser or call the live API from this environment, so this is a code/config/data review. Anything about how the app *looks or behaves at runtime* is covered by the manual checklist (`step-05-qa-checklist.md`), not here.

## 1. What was checked and the result

| Area | Method | Result |
|---|---|---|
| **i18n parity** | Parsed `en.json` / `ar.json` | 868 keys each, none missing either side, no empty Arabic values, no identical EN=AR strings, `{{placeholders}}` match in every key |
| **i18n references** | Extracted every `'KEY.PATH'` used in `.ts` / `.html` (786) | All defined. The only "undefined" hit (`LAYOUT.NAV.SETTINGS`) is inside a doc comment. Step 01's "3 missing keys" no longer reproduce |
| **Accessibility (static)** | Scanned 46 templates | 0 icon-only `<button>`/`<a>` without an accessible name, 0 `<img>` without `alt`; drawer = `role="dialog"` + `aria-modal` + labelled + focus trap + Esc; confirm = `role="alertdialog"` + focus trap + Esc + focus returns to the opener |
| **Hard-coded UI text** | Scanned templates and `notify.*` calls | None (all text goes through i18n keys; the design-system page excluded) |
| **RTL readiness (CSS)** | Scanned 68 SCSS files | No physical `margin/padding/border-left|right`, `float`, `left:`/`right:`, `text-align: left|right`; logical properties used (`inset-inline-*`, `margin-inline-*`, `text-align: start`), 38 `dir` hooks |
| **Page states** | Checked each list template and the shared table | Every list has `FailedState` + confirm dialog; card lists have skeleton, empty state and pager; table lists get skeleton / empty / pager from `app-data-table` |
| **Routes and guards** | Read `main.routes.ts` | Every CRUD route has `permissionGuard` + permission + breadcrumb. Dashboard, profile, no-access and 404 are sign-in-only by design (commented). `design-system` is only added when `showDesignSystem` is true (false in production builds) |
| **Production isolation** | `check:providers`, `check:prod-bundle` (Step 04) | No mock code and `useMock:!1` in both production-like builds |
| **API contract** | OpenAPI spec vs the app | See `api-contract-check.md` (paths, verbs, bodies, params match; response shapes unverified) |

## 2. Findings (none fixed — they go to Step 06 unless you say otherwise)

| ID | Finding | Severity | Evidence | Proposed disposition |
|---|---|---|---|---|
| S5-01 | **Dashboard has no backend endpoint.** The app calls `GET /dashboard/summary`; the real API has no such path, so the page ends in its error state on the live API. | High (visible) | OpenAPI spec; README already notes it | Needs your decision: hide the page, compute from other endpoints, or wait for a backend endpoint |
| S5-02 | **Validation toasts show English field names in the Arabic UI for several fields.** `VALIDATION_FIELDS.*` has labels for 32 fields; the API's `Email`, `CountryCode`, `PhoneNumber`, `Password`, `PasswordConfirmation`, `NewPassword`, `NewPasswordConfirmation`, `CurrentPassword`, `RoleId`, `Permissions`, `Code`, `Token` fall back to the humanised English name. | Low | `error.interceptor.ts` `fieldLabel()`, `en.json` / `ar.json` | Step 06: add the 12 keys (EN + AR) |
| S5-03 | **About 16 i18n keys are defined but never referenced** (`SUCCESS.SAVED/DELETED/UPDATED`, `FILE_VALIDATION.EMPTY_FILE`, 4 `BRANCHES.FORM.*_PLACEHOLDER`, `BRANCHES.DETAILS.SUBTITLE`, 3 `PACKAGES.PRICE.*`, 3 `OFFERS.PRICE.*`). Dynamic keys (`PERMISSIONS.MODULES/ACTIONS.*`, `BRANCHES.DAYS.*`, `VALIDATION_FIELDS.*`, `BOOKING_STATUS.*`) are used and excluded. | Info | scripted scan, dynamic builders confirmed | Step 06 housekeeping, optional |
| S5-04 | **Deleting the last row of a page in Users / Roles leaves the table on an empty page** (the Chairs-shaped services step back one page; Users/Roles don't). Barbers: to confirm in QA. | Medium | code reading (Step 04 change-log item 4) | Step 06 (or fold into Step 05 QA result) |
| S5-05 | **`Id` is not sent in the multipart body of `PUT /barbers/{id}` and `PUT /offers/{id}`**, while the spec lists it. | Check | OpenAPI spec | QA case B-05 / O-05 on the real API; fix only if the API rejects the update |
| S5-06 | **CORS and the Vercel origin are untested.** The deployed app calls `https://api-odel.subhe.site` from another origin; if the backend doesn't allow it, every request fails in the browser. | Unknown | cannot test from here | QA case A-01 is the first check |
| S5-07 | **HTML templates are still not auto-formatted** (Step 03 decision). | Info | Step 03 change log | Revisit after QA confirms spacing |
| S5-08 | **Remaining defect pins** (9 `it.fails`): CH-05, XM-01, XM-02, BR-02, BR-03, and the barbers phone cases. | Known | Step 04 change log | Step 06 (BR-03 awaits D13) |

## 3. What this review cannot tell you

Rendering, spacing, colours, Arabic text clipping, responsive layouts, focus order, real API latency / errors, CORS, token expiry and refresh in practice, and file upload behaviour. Those are the purpose of the manual checklist.
