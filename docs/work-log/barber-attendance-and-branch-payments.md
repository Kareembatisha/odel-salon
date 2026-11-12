# Branch payment methods + Barber attendance — work log

Source: API contract pages for *Branches* (instaPayAccount / walletNumber) and *Barber Attendance*.
Agreed plan (5 steps, project returned after each): 1) Branch payment methods · 2) Attendance foundation · 3) Attendance service · 4) Attendance page · 5) Polish and delivery.
Agreed defaults: attendance is a separate page `/main/barbers/attendance` with its own sidebar item, gated by `Barber.Attendance` only; per-row toggle saves immediately; first branch selected by default; localized 409 message built from the sheet; today's date shown and reloaded on tab focus; mock seeded with a barber who has upcoming bookings; responses assumed to match the contract PDF.

## Step 1 — Branch payment methods (done)

| Layer | Change |
|---|---|
| Model | `BranchDetails` and `BranchPayload` gain `instaPayAccount` and `walletNumber` (`string \| null`; `null` = method off) |
| Validation | New `payment` form group, both fields optional. InstaPay: max 100 characters on the **trimmed** text. Wallet: Egyptian mobile in international format (`+20` + 10/11/12/15 + 8 digits); empty / whitespace = off. The branch-phone regex became the shared `EGYPT_INTL_MOBILE` constant (same pattern the API asks for) |
| Mapper | Trims both and sends **explicit `null`** for blank (the API removes a value that is not sent); edit loads the current values into the form so an untouched save sends them back |
| Form page | New "Payment methods" section (hint says an empty field turns the method off), field errors mapped to i18n keys |
| Details page | New "Payment methods" panel: accounts shown left-to-right, "Not enabled" when null |
| Mock | Branches store, update and return both fields (default `null`) |
| List | Unchanged, as the API (the list does not return the payment fields) |
| i18n | 10 new keys per language (EN + AR) |
| Tests | Validators/factory (accepted + rejected formats), mapper (trim, blank → null, round trip), form page (section, create, trimmed values, invalid wallet / over-long InstaPay block the save, edit pre-fill and save back unchanged, clearing sends null), details page (set / one missing / both missing), mock repository, API repository (explicit null sent) |

### Verification
Tests 108 files, **1458 passed**, 4 expected fail (unchanged). `tsc` (app + spec), ESLint, Prettier clean. Development, production and `build:template-brand` builds OK; `check:prod-bundle` and `check:providers` OK. Not verified: the real API or a browser.

## Step 2 — Attendance foundation (done)

| Layer | Change |
|---|---|
| Permission | `PERMISSIONS.Barber.Attendance` added to the catalog (also shows in the Roles permission matrix); `Barber.Attendance` added to the mock manager role; labels `PERMISSIONS.ACTIONS.Attendance` (EN/AR) |
| Models | `BarberAttendanceRow` (note `barberId`, not `id`), `BarberAttendanceItem`, `SetBarberAttendanceRequest` |
| Contract | `IBarberRepository.getAttendance(branchId)` and `setAttendance(payload)` |
| API repository | `GET /barbers/attendance?branchId=…`, `PUT /barbers/attendance` (JSON body, explicit list) |
| Mock repository | Same rules as the API: sheet = ACTIVE barbers of the branch ordered by name; unmarked = absent; a mark counts only on today's Cairo date; `400` empty list / repeated id; `404` unknown barber (or branch, as a `status:false` body); `409` marking a PRESENT barber with upcoming bookings absent; all-or-nothing; barbers not sent keep their state |
| Mock data | `barberAttendance` (daily state) and `barberUpcomingBookings` (two seeded barbers with 3 and 1 upcoming bookings, so the 409 can be reproduced in dev: mark present, then absent) |
| i18n | `BARBERS.ERRORS.ATTENDANCE_REQUIRED / _DUPLICATE / _HAS_BOOKINGS` (the last takes `name` and `count` and will also be used for the localized 409 message in the UI), `VALIDATION_FIELDS.Barbers`, `PERMISSIONS.ACTIONS.Attendance` — EN + AR |
| Tests | API repository (GET params, PUT body), mock repository (18 cases: ordering, suspended excluded, branch isolation, bookings count, "today only", 404 branch; set whole sheet / only sent barbers change / present with bookings OK / 409 and nothing saved / absent-without-ever-present OK / absent after bookings gone / 400 empty / 400 duplicate / 404 all-or-nothing), permission catalog, i18n label parity |

Observation (not changed): the role matrix has no `PERMISSIONS.ACTIONS.ToggleStatus` label for the Chair action, so it falls back to the raw name.

### Verification
Tests 108 files, **1476 passed**, 4 expected fail (unchanged). `tsc` (app + spec), ESLint, Prettier clean. Development, production and `build:template-brand` builds OK; `check:prod-bundle` and `check:providers` OK. Not verified: the real API or a browser.

## Step 3 — Attendance service (done)

New `BarberAttendanceService` (`modules/barbers/service/`, root singleton, standard conventions: token DI, signals, stale-response guard, in-flight counter, `status:false` = failure).

| Area | Behaviour |
|---|---|
| Branch selection | `initialize()` loads the branch options once (oldest first), selects the first, keeps the selected branch on re-entry, falls back to the first if it was deleted, and does nothing when there are no branches. `selectBranch(id)` clears the old rows at once and loads the new sheet; a late answer for the previous branch can't overwrite it |
| Sheet | `load()` — only the latest response wins; failure sets `hasError` and keeps the previous rows; exposes `rows`, `loading`, `hasError`, `presentCount`, `totalCount`, `sheetDate` |
| Day change | `refreshIfDayChanged()` reloads when the Cairo date moved on since the sheet was loaded (the page will call it on tab focus) |
| Marking | `setPresent(row, isPresent)` sends a **single-item** `PUT`, patches the row on success, then reloads the sheet (counts stay the server's truth). **No success toast** — the toggle is the feedback and a morning of toasts is noise (one line to change if you want one) |
| Blocked absent | A present barber with upcoming bookings can't be marked absent: **localized warning built from the sheet** (`BARBERS.ERRORS.ATTENDANCE_HAS_BOOKINGS` with name and count), no request sent |
| Stale sheet | If the server still answers `409` (or `404`), the interceptor already showed the server's message; the service reloads the sheet so the row shows the new count |
| Concurrency | `pendingIds` (the barber being saved — the row's toggle is disabled) and a `saving` counter; a second call for the same barber is refused, different barbers can run at the same time, `saving` stays true until the last finishes, everything is released on failure |

Tests: 28 service cases (branch selection, stale responses, errors, day change, marking, blocked absent, 409/404 reload, pending state) plus a 5-case **end-to-end spec against the real mock repository** (open on the first branch; mark present; blocked absent with the seeded bookings; stale sheet → 409 → refreshed; yesterday's mark doesn't count).

### Verification
See the run for this step: tests, `tsc` (app + spec), ESLint, Prettier, development / production / `build:template-brand` builds, `check:prod-bundle`, `check:providers`. Not verified: the real API or a browser.

## Step 4 — Attendance page (done)

| Area | Change |
|---|---|
| Route | `/main/barbers/attendance` (lazy), `Barber.Attendance` only, breadcrumb Barbers / Attendance |
| Sidebar | "Attendance" item right under Barbers (Salon section), same permission as the route; the longest-route rule highlights it instead of Barbers |
| Page | `BarbersAttendance`: branch selector (first branch by default, no "all"), sheet date and "N of M present", one row per barber (photo, name, upcoming bookings, Present/Absent badge, switch). Skeleton, no-branches, empty-branch and failed states; a failed *reload* keeps the rows and shows a compact retry |
| Marking | Switch saves at once through `setPresent`; disabled for the barber being saved and for a present barber with upcoming bookings (row explains why). No toast; polite live region announces the save |
| Day change | Window focus / visibility change calls `refreshIfDayChanged()` |
| Utils | `formatAttendanceDate` (weekday + full date, EN / AR, never shifted by the browser time zone) |
| i18n | `LAYOUT.NAV.BARBER_ATTENDANCE` and 20 `BARBERS.ATTENDANCE.*` keys, EN + AR |
| Tests | Page (21: list/order, date + counter, locked switch, single-item PUT + reload, live region, in-flight, failure, 409 refresh, branch switch, permission, empty / failed / reload-failed states, tab focus, Arabic), date util (4), wiring (route, lazy load, sidebar item), sidebar (active item, Attendance without Barbers) |

## Step 5 — Polish and delivery (done)

- Mock: the barber with 3 upcoming bookings now starts **present today**, so the locked switch is visible on first open (`MockDb.seedAttendance`, tested). Everything else starts absent.
- README: route map, new "Barber attendance" section, manager role permissions, notes (payment methods, attendance assumptions).
- QA checklist: `AT-01…AT-10` (attendance) and `BR-06 / BR-07` (payment methods).

### Verification
Tests, `tsc` (app + spec), ESLint, Prettier, development / production / `build:template-brand` builds, `check:prod-bundle`, `check:providers` — see the final run in the delivery message. Not verified: the real API or a browser.

## Fix — Payment methods section squeezed on the branch form

The branch form page is a 12-column grid and every section declares its span; `.payment` had none, so it fell into one column and rendered as a thin strip. Fixed with `.payment { grid-column: 1 / -1 }` (full width, all breakpoints). New test in `branches-form.spec.ts` ("page layout") checks that every top-level section has a `grid-column` rule, so a future section can't repeat this. Lesson for the log: Step 1 tests checked the section's content, not its layout.
