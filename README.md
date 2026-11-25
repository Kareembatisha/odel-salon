# Odel Salon — Admin Dashboard

Angular admin dashboard for Odel Salon (Sprint 0 foundation): project structure, layouts, auth, permission-aware routing and the design system. Built on the same stack and structure as the AlSalam reference project.

## Stack (identical to the reference)

| | |
|---|---|
| Angular | 21.2 — standalone components, signals, `OnPush` |
| UI | PrimeNG 21 (Aura preset, customised) + PrimeIcons 7 |
| Styling | SCSS design tokens + Tailwind 3.4 (layout utilities only, `preflight` off) + `tailwindcss-primeui` |
| i18n | `@ngx-translate` 17 — English (default) and Arabic (RTL) |
| Tests | Vitest 4 + jsdom (`ng test`) |
| Tooling | Prettier 3 (`npm run format`) + ESLint 9 (`npm run lint`) — see *Architecture standard* |

`package-lock.json` is carried over from the reference, so `npm install` resolves the same versions.
Removed because Odel has no use for them: `pdfjs-dist`, `qrcode`, the `postinstall` PDF-worker copy, and (Step 03) `exceljs` / `file-saver` together with the unused Excel/Print export services. Reintroduce them when an export feature is actually planned.

## Run

```bash
npm install
npm start            # http://localhost:4200 — mock data (environment.useMock = true)
npm run build        # production build (real API, design-system page hidden)
npm test
```

**Mock sign-in** (any password with 6+ characters; OTP code is `123456`)

| Email | Role | Access |
|---|---|---|
| `admin@odel.com` | SuperAdmin | everything |
| `manager@odel.com` | BranchManager | operations only — sidebar hides the rest, direct URLs land on *No access* |
| `receptionist@odel.com` | Receptionist | view-only: sees Bookings and Payment reviews, but no *End session*, Approve or Reject |

Set the real API in `src/environments/*.ts` (`apiUrl`) and flip `useMock` off.

## Structure

```
src/
  brands/odel/            ← build-time identity: _brand.scss, brand.ts, assets/logo-mark.svg
  brands/_template/       ← starting point for the next client
  styles/                 ← design tokens (see below)
  app/
    core/                 guards, interceptors (token, lang, error), services (theme, language,
                          notification, network…), auth/permissions.ts, theme/odel-preset.ts
    layout/               auth-layout, main-layout (sidebar, header, breadcrumbs, nav.config.ts)
    shared/               components/ (button, inputs, badge, stat-card, tabs, data-table, modal, states…),
                          model/, utils/, validators/
    modules/
      auth/               login · forgot password · OTP · new password · success
      users/              list + filters + bulk delete · create/edit drawer · status switch
      roles/              list · role details (permission matrix)
      branches/           cards · create/edit pages · details · visibility switch
      chairs/             cards + summary · create/edit drawer · status switch
      barbers/            table + filters + bulk delete · create/edit drawer with photo · status switch · daily attendance page
      services/           price table per branch + summary · create/edit page (price card per branch) · bulk tools
      packages/           cards per branch + summary · create/edit drawer (service picker, "Before discount") · status switch
      offers/             status tabs + cards per branch · create/edit drawer (banner, dates, service picker, "Before discount") · stop / resume
      bookings/           period tabs + filters + table · details page · "End session"
      payment-reviews/    review queue (screenshot + amount due) · approve / reject with a reason · proof viewer
      profile-management/ profile + change password
      design-system/      living reference page (dev only)
      no-access/ not-found/
      main.routes.ts      the full route map
  core/mock/mock-db.ts    one in-memory "database" shared by every mock repository
```

Feature modules follow `model → repository (interface + api + mock) → service (signals) → pages`. Pages never call a repository directly.

## Architecture standard

The approved standard lives in [`docs/step-02/`](docs/step-02/step-02-architecture-standard.md) (reference modules: Chairs, Offers, Branches; decisions in `step-02-decisions-required.md`). Highlights that affect day-to-day work:

- **Structure:** every component has its own folder (`components/<name>/<name>.ts|html|scss|spec.ts`), including forms. Cards, forms and details are only created when a module needs them.
- **Routes:** all `/main` routes stay in `modules/main.routes.ts`.
- **Imports:** reach `core/` and `shared/` through `@core/*` and `@shared/*`, never deep relative paths (enforced by ESLint).
- **Approved exceptions:** `auth`, `profile-management`, `no-access`, `not-found` and `design-system` do not follow the CRUD layout. Services keeps its 20-row page size; Chairs keeps its own `ToggleStatus` permission. `services/service/services.service.ts` is intentional (layer folder `service/`, module `services`).
- **Cross-feature component:** `modules/services/components/service-picker` is also used by Packages and Offers. It stays in the Services module on purpose (decision D9); import it from there and keep it free of Packages/Offers-specific logic.
- **Shared sibling stylesheet:** `modules/services/components/bulk-form.scss` is shared by the three bulk-tool forms through `styleUrls`.

### Mock data and production builds

Every repository (all 10, including auth) is an injection token. `src/app/app.providers.ts` registers them for development and tests (`environment.useMock` picks mock data or the real API); the production configurations **replace that file** with `src/app/app.providers.prod.ts`, which imports API repositories only, so no mock class, mock data or mock login reaches a production bundle. Keep both files in step when adding a repository.

```bash
npm run check:providers     # both provider files list the same tokens; prod has no mock references;
                            # angular.json swaps the file in for every production-like configuration
npm run build && npm run check:prod-bundle
npm run build:template-brand && npm run check:prod-bundle
```

`ng test` builds with the default (production) configuration, so unit tests see `environment.prod.ts` and the production providers; specs that need mock data import the mock repositories directly.

### Formatting and linting

```bash
npm run format         # Prettier (double quotes, LF, width 100) for ts / scss / json
npm run format:check
npm run lint           # ESLint: restricted deep relative imports, no `any`, OnPush + standalone,
                       # non-null assertions reported as warnings
```

Angular HTML templates (and inline templates in `.ts`) are **not** auto-formatted yet: re-indenting them changes whitespace around interpolations and could shift spacing in the UI, so it waits for browser QA. The `@media print` block in `styles/styles.scss` was written for the removed print-export service and is currently unused.

## Design system

**Direction:** warm charcoal + champagne gold. The sidebar and the sign-in brand panel stay charcoal in both themes; gold is used for the active state, primary actions and focus — nowhere else.

- **Never hardcode a color.** Use the SCSS tokens: `@use 'styles/variables' as v;` → `v.$surface`, `v.$text-secondary`, `v.$primary`, `v.$danger-text`…
  They resolve to CSS variables (`--odl-*`), so every component follows **light/dark** and the **active brand** automatically.
- `$primary` is a *fill* — put `$on-primary` text on it. Gold used as *text* on a surface is `$primary-text` (AA contrast in both themes).
- Radius is hierarchical: inputs/buttons 10 · cards 14 · modals 20 · pills full. Spacing is a 4px grid. Min text size 12px.
- Typography: Manrope (UI), Cormorant Garamond (wordmark, page titles, big numbers); IBM Plex Arabic replaces both in RTL.
- Use logical CSS (`margin-inline`, `inset-inline-start`, `text-align: start`) so RTL needs no overrides.
- Reusable patterns live in `styles/_patterns.scss` (`card`, `focus-ring`, `truncate`, `skeleton`, `icon-button`, `menu-surface`).
- Open **Settings → Design system** (dev builds) to see every token and component, in both themes and languages.

### Brand flavors (build-time)

Everything client-specific is in `src/brands/<name>/` (`_brand.scss` palette + display font, `brand.ts` name/logo/support email, `assets/`).

```bash
npm run build:template-brand   # production build with src/brands/_template instead of odel
```

To add a client: copy `_template`, edit it, and add **two** configurations in `angular.json`: the brand one (like `brand-template`) and a production pair (like `production-brand-template`) that lists **both** the `environment.prod.ts` swap and the brand swap. Angular does not merge `fileReplacements` across combined configurations, so a brand configuration used alone with `production` silently keeps the development environment (mock data on).

## Auth, roles and permissions

Implements `API_Contract_Authentication.md` (all 9 endpoints). Email + password with refresh token, cross-tab session sync and a silent 401 → refresh → retry.

| Endpoint | Where it lives |
|---|---|
| `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh-token` | `AuthService` → login page, header, error interceptor |
| `POST /auth/password/forgot` → `/verify` → `PATCH /reset` | forgot-password → 6-digit OTP → new-password pages |
| `PATCH /auth/password/change` | `AuthService.changePassword()` → Profile → Password card |
| `GET /auth/profile` · `PUT /auth/profile` (multipart) | `ProfileService` → Profile page |

- The backend returns `role` and `permissions[]` at login and on every refresh. Permissions are `Resource.Action` strings defined once in `core/auth/permissions.ts` (e.g. `User.View`); use `PERMISSIONS.User.Edit`, never a raw string.
- Routes: `canActivate: [permissionGuard]` with `data: { permission }`. The sidebar filters by the same permissions, so a user only sees what they can open.
- **The profile only requires being signed in.** `/main` has no page of its own: `homeRedirectGuard` sends the user to the first sidebar item they can open (or to their profile). Add new permission keys to `permissions.ts` as the backend introduces them.
- Breadcrumbs build themselves from route `data.breadcrumb`.

### Email verification (OTP)

The code is **exactly 6 digits**, one box each (`OTP_LENGTH` in `pages/email-verification/email-verification.ts`; the mock backend accepts `123456`). Inputs are numeric on mobile (`inputmode="numeric"`) and carry `autocomplete="one-time-code"`, so an SMS autofill works.

- **Typing** moves to the next box; typing over a filled box replaces its digit; letters and symbols are ignored (Arabic-Indic digits ٠-٩ are converted).
- **Paste / SMS autofill / keyboard suggestions** that put the whole code in one box are spread over the boxes: a full code always starts at the first box, a shorter paste starts at the box it was pasted into. It fills in ONE update, so the code is verified once — never half old, half new.
- **Keys** — Backspace on an empty box clears the previous box and goes back to it; Arrow Left / Right, Home and End move between the boxes (the row stays left-to-right on the RTL page).
- The code is verified by itself as soon as the sixth box is filled; every box is named for a screen reader (*Digit 3 of 6*) and the row is a labelled group.

### Profile page (`/main/profile`)

- Personal details: full name, email, country + phone. Photo: JPG/PNG/WebP up to 2 MB, with preview; it is only uploaded when you press *Save changes*.
- After saving, the profile is refetched (the PUT returns no body) and the header name and avatar update instantly.
- Password: current + new + confirmation, with the same five-rule policy and strength meter as the reset flow (`shared/validators/password-policy.validator.ts`).
- Wire format for the update is PascalCase `multipart/form-data` (`FullName, Email, CountryCode, PhoneNumber, Image, RemoveImage`) — see `modules/profile-management/utils/profile-form-data.ts` (unit-tested).

## Route map

Only sections that exist are routed and shown in the sidebar. When a new feature lands, add its route (`modules/main.routes.ts`), its sidebar item (`layout/main-layout/nav.config.ts`) and its permission keys (`core/auth/permissions.ts`) together.

| Page | Route | Permission |
|---|---|---|
| Home | `/main` | redirects to the first section the user can open |
| Users | `/main/users` | `User.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Roles & permissions | `/main/roles` | `Role.View` (+ `Create` / `Edit` / `Delete`) |
| Role details (permission matrix) | `/main/roles/:id` | `Role.View` (editing needs `Role.Edit`) |
| Branches | `/main/branches` | `Branch.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Chairs | `/main/chairs` | `Chair.View` (+ `Create` / `Edit` / `ToggleStatus` / `Delete` for the actions) |
| Barbers | `/main/barbers` | `Barber.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Barber attendance | `/main/barbers/attendance` | `Barber.Attendance` only (not `Barber.View`) |
| Services (Menu & services) | `/main/services` | `Service.View` (+ `Edit` for the status switch and bulk tools, `Delete` for delete) |
| New service | `/main/services/new` | `Service.Create` |
| Edit service | `/main/services/:id/edit` | `Service.Edit` |
| Packages | `/main/packages` | `Package.View` (+ `Create` / `Edit` for the drawer and the status switch, `Delete` for delete) |
| Offers | `/main/offers` | `Offer.View` (+ `Create` for "Add offer", `Edit` for the edit drawer and Stop / Resume, `Delete` for delete) |
| Bookings | `/main/bookings` | `Booking.View` |
| Payment reviews | `/main/bookings/payment-reviews` | `Booking.View` (approve / reject need `Booking.Review`) |
| Booking details | `/main/bookings/:id` | `Booking.View` ("End session", "Mark as missed", "Cancel booking" and "Change barber" need `Booking.Manage`) |
| Customers | `/main/customers` | `Customer.View` |
| Customer profile | `/main/customers/:id` | `Customer.View` |
| My profile | `/main/profile` | sign-in only |
| Design system (dev builds only) | `/main/design-system` | — |

## Users and Roles

Implements `API Contract — Users` and `API Contract — Roles` (all 12 endpoints).

**Users** — server-side search (name/email), role and status filters, 10 per page. Create and edit in a side drawer; edit can optionally set a new password. Active/inactive switch (`PATCH …/toggle-status`). Select rows for bulk delete (`DELETE /users` with `{ ids }`).
**Roles** — list with user and permission counts; create/rename in a drawer; bulk delete. *Role details* shows every permission grouped by module with per-module select-all; nothing is sent until **Save permissions** (`PUT /roles/{id}/permissions` replaces the full list), and a save bar appears whenever there are unsaved changes.

- Buttons and switches are hidden/disabled when the user lacks the permission (`*appCan`), and role details becomes read-only without `Role.Edit`. The backend stays the real boundary.
- You can't deactivate or delete **your own account**, or delete **your own role**, from the UI.
- Saving the permissions of the role you hold refreshes your session so the sidebar updates immediately.
- Permission modules/actions are labelled from i18n (`PERMISSIONS.MODULES.*`, `PERMISSIONS.ACTIONS.*`); any new key the backend adds still renders its raw name until translated.

## Accessibility fixes (this round)

Fixed, and re-verified with axe-core across every page in light/dark × English/Arabic, plus manual keyboard and mobile passes:

- **Focus trapping for Drawer and ConfirmModal** — new `shared/directives/focus-trap.directive.ts` (unit-tested). Tab/Shift+Tab now cycle inside the dialog, Escape closes it from anywhere on the page (not just while focus was inside), and closing returns focus to the exact element that opened it (falls back to the main content region if that element is gone, e.g. a deleted row).
- **Text contrast** — `--odl-text-muted` and `--odl-sidebar-text-muted` (`styles/_theme.scss`) were darkened/lightened just enough to clear 4.5:1 on every surface they appear on; axe's `color-contrast` rule now reports zero violations anywhere in the app.
- **Profile page labels** — the photo file input and the scrollable permissions list in `profile-view.html` now have accessible names/focusability.
- **Dead header search removed** — `header.html`/`.scss` (it did nothing and sat next to the real, working per-page search).
- **404 inside the shell** — sized to the content area instead of a full 100vh, so it no longer adds a second scrollbar; it also now shows a breadcrumb.
- **Tabs, date input, service picker (shared building blocks)** — `shared/components/tabs` (`<app-tabs>`: controlled WAI-ARIA tabs with optional count pills; arrow keys move focus and flip in RTL, Enter/Space/click selects), `type="date"` (+ `min` / `max`) on `FloatLabelInput` (native picker, `yyyy-MM-dd`, label always lifted), and in `modules/services`: `ServicePicker` (checkbox list of a branch's ACTIVE services, plus services a bundle has that were deactivated since), `ServiceTotals` (the "Before discount" box), `ServicesService.loadServiceOptions(branchId)` and `utils/service-option.util.ts` (`toServiceOptions`, `servicesTotals`, `savingsAmount`). Packages and Offers share them; the forms own the selection and the rules, the components only render.
- **Mobile Users cards** — below 768px, the Users table (`modules/users/pages/users-list/users-list.html`) renders as cards instead of a horizontally-scrolling table, through a new generic, optional `odlCard` template on `DataTableComponent` (`shared/components/data-table/`). Same data, same server-side selection/pagination/permissions — nothing duplicated. Every other table (Roles, future ones) is unaffected since the feature is opt-in per usage.

Known remaining findings (moderate/minor, pre-existing, not touched this round — out of scope per this change's instructions): the auth pages (`/login`, `/forget-password`) have no `<main>` landmark and no level-one heading; the sidebar's two `<nav>` regions aren't uniquely labelled; the sortable/empty table header cell has no visible text for screen readers. None are regressions from this change.

## Barbers

Implements `API Contract — Barbers` (all 6 endpoints) in `modules/barbers/`, built the same way as Users (table, filters, drawer, bulk delete).

- **List** — Users-style table: photo (or the name's initial), branch (Arabic or English by UI language), phone, status. Server-side search (full name or phone), branch and status filters, 10 per page, sorted by name by the API. Below 768px the table becomes cards.
- **Create / edit** — side drawer. Edit loads `GET /barbers/{id}` first. Fields: branch, full name (max 100), phone, optional photo.
  - **Phone** is typed any common Egyptian way (`01001234567`, `+20 100 123 4567`…) and sent as `+201XXXXXXXXX` (`utils/barber-phone.util.ts`). Uniqueness is checked by the backend.
  - **Photo** — JPG / PNG / WEBP up to 5 MB, checked in the browser before upload. Sent as `multipart/form-data` with PascalCase fields (`BranchId, FullName, Phone, Image, RemoveImage`) — see `utils/barber-form-data.ts`. Picking a photo replaces it; **Remove photo** sends `RemoveImage=true` with no `Image`; neither keeps the current one. The photo only changes when the form is saved.
  - **Branch** can be changed on edit — that *transfers* the barber, and the form says so.
- **Status** — the switch flips `isActive` (`PATCH …/toggle-status`, `Barber.Edit`). Suspended barbers are hidden from the app and can't be booked.
- **Delete** — one barber from the row, or select several for one bulk `DELETE /barbers` with `{ ids }`. All-or-nothing, permanent (photos too), always behind a confirmation.
- **Last active barber rule** — in a *visible* branch the last active barber can't be suspended, deleted or moved (409 "…is the last active barber in a visible branch. Hide the branch first"); the check covers the whole bulk request. Hidden branches have no such restriction. The backend's message is shown as-is.
- **Mock backend** — `core/mock/mock-db.ts` seeds each branch with as many barbers as its `barbersCount` (a few suspended), and the mock repository enforces the same rules (valid + unique phone, photo type/size, the 409 lock, all-or-nothing delete) and keeps `barbersCount` on the Branches screen in sync. In mock mode, "showing" a hidden branch also needs an *active* barber.
- **Permissions** — `Barber.View` opens the page; `Create`, `Edit` (also the status switch) and `Delete` show or hide their actions. The mock `BranchManager` role has `Barber.View` and `Barber.Attendance`; `SuperAdmin` has everything.

### Barber attendance (`/main/barbers/attendance`)

Implements `API Contract — Barber Attendance` (`GET` / `PUT /barbers/attendance`) as its own page with its own sidebar item, gated by `Barber.Attendance` **only**.

- **One branch, today.** The sheet is today's (Cairo date) for the ACTIVE barbers of ONE branch, ordered by name. The first branch is selected by default (no "all branches"), like Offers and Packages. The page shows the sheet's date and "N of M present".
- **Saves immediately.** Each row has a Present / Absent switch; flipping it sends one single-item `PUT` and then reloads the sheet. There is **no success toast** (the switch is the feedback); a polite live region tells screen-reader users what was saved. Only the barber being saved is disabled; different barbers can be saved at the same time.
- **Bookings lock.** A present barber with upcoming bookings can't be marked absent (the API answers `409`), so that switch is disabled and the row says why, with the booking count. If the sheet was stale and the server answers `409` / `404` anyway, the server's message is shown and the sheet reloads.
- **Day change.** When the tab regains focus, the sheet reloads if the Cairo day changed while the page was open.
- **States.** Loading skeleton, no branches, no active barbers in the branch, failed load with retry (rows stay on screen when only a *reload* fails).
- **Mock backend.** Same rules as the API: `400` empty list / repeated id, `404` unknown barber or branch, `409` absent-with-bookings, all-or-nothing, a mark counts only on today's date. The upcoming-bookings count is derived from the mock bookings (pending / confirmed, not over yet), so approving, rejecting or ending a booking changes it. Seed: the first barber (5 upcoming) starts **present**, so the lock shows on first open; the second barber of the first branch has none and toggles freely. The mock `BranchManager` role has `Barber.Attendance`.
- **Code.** `BarberAttendanceService` (signals, stale-response guard, in-flight counter) → `pages/barbers-attendance/`; `utils/barber-attendance-date.util.ts` formats the date.

## Services (Menu & services)

Implements `API Contract — Services` (all 8 endpoints) in `modules/services/`, built as `model → repository (interface + api + mock) → service (signals) → pages`.

A service is **one record with a price row per branch** (duration, Regular, VIP, optional Home price, active). The API prices one branch at a time, so the list always shows ONE branch — there is no "all branches" view.

- **List** (`/main/services`) — branch selector (first branch by default; oldest first, because the API lists newest first), four summary cards (Services, Active, Home, Not priced yet — counted by the backend over the whole branch and unaffected by search/filters), search (Arabic or English name), status and home filters, 20 per page. A service with no price in the branch shows a **Not priced** badge and a *Set prices* button instead of the switch. Below 768px the table becomes cards.
- **Row switch** — `PATCH /services/{id}/branches/status` with only the selected branch (`isActive` is the *target* state, not a toggle). A refused change (409) leaves the switch where it was.
- **Create / edit** (`/main/services/new`, `/main/services/:id/edit`) — Arabic + English names and **one price card per branch** (the API wants every branch exactly once). Each card: duration (5–480, steps of 5), Regular and VIP price (always required), home toggle + home price (required only while it's on, sent as `null` otherwise), active switch. Prices the branch doesn't offer yet (`branchAllows*`) stay required but are shown quieter with a note; a branch with no price yet gets a "Set prices" state. *Copy to all branches* fills every card from one. Validation mirrors the contract inline (`utils/service-form.validators.ts`); on a failed submit focus moves to the first error. The backend's 400/409 messages (duplicate name, last-active lock) arrive as interceptor toasts.
- **Delete** — one service from the row or several with row checkboxes → one `DELETE /services` with `{ ids }`, all-or-nothing, removed from every branch, always behind a confirmation.
- **Bulk tools** (drawers, `Service.Edit`):
  - **Change prices by %** (`POST /services/adjust-prices`) — branch + percentage (-90…500, not 0), for every priced service of the branch or just the ticked ones. A preview lists old → new prices using the same rounding as the backend (nearest pound, never below 1; durations don't change). A result above 100,000 EGP blocks the request.
  - **Copy prices from another branch** (`POST /services/copy-prices`) — overwrites duration, prices, home availability and status of the services priced in the source; the target's other services stay. Shows how many services will be copied; identical branches are refused.
  - **Set status in branches** — for the ticked services, activate/deactivate in the chosen branches (one status request per service; one success toast).
- **Mock backend** — `core/mock/mock-db.ts` + `service-mock.repository.ts` enforce unique names, every-branch-once, price/duration limits, the "last active service of a *visible* branch" 409 (deactivate / delete / copy) and all-or-nothing delete. Not simulated: the 409s for services used by running offers (that module doesn't exist yet). Packages don't block deleting or deactivating a service in the mock either — the contract for Services doesn't say the real API does.
- **Permissions** — `Service.View` opens the page; `Create`, `Edit` (switch, edit, bulk tools) and `Delete` show or hide their actions.

## Packages

Implements `API Contract — Packages` (all 6 endpoints) in `modules/packages/`, built as `model → repository (interface + api + mock) → service (signals) → page`.

A package bundles **at least two services of ONE branch** at a discounted price per booking type (Regular, VIP, optional Home). It never moves between branches, so — like Services — the list always shows ONE branch (the first by default, oldest first); there is no "all branches" view.

- **List** (`/main/packages`) — branch selector, three summary cards (Packages, Active, Inactive — the API counts total and active over the whole branch, inactive is the difference; unaffected by search/filter), search (Arabic or English name), status filter, 12 per page. Each card shows the services, the total duration, a row per price with the services' total struck through and a **Save EGP X** pill, or **In branch only** when there is no home price.
- **Status switch** — `PATCH /packages/{id}/toggle-status` (a flip, no body), gated by `Package.Edit` (the contract has no separate toggle permission). Re-activating can be refused (a service is no longer active, or no longer home-available); the switch stays where it was and the interceptor shows why.
- **Create / edit** (drawer on the list, `Package.Create` / `Package.Edit`) — Arabic + English names, a checkbox picker of the branch's ACTIVE services (loaded through `ServicesService.loadBranchServices`), a **Before discount** box (totals + duration of the chosen services, same numbers the API returns as `original*Price` / `durationMinutes`; the 15-minute booking buffer is not included), and Regular / VIP / Home prices. Inline validation mirrors the contract (`model/package.model.ts` limits): ≥ 2 different services, every price > 0, ≤ 100,000, ≤ 2 decimals and **lower than its total**, a home price only while every chosen service allows home visits (empty = in branch only, sent as `null`). The branch is shown locked and is only sent on create. A service the package already has but that was deactivated since is listed as "no longer active" and must be removed before saving.
- **Delete** — from the card, behind a confirmation → `DELETE /packages` with `{ ids }` (bulk, all-or-nothing; the UI deletes one at a time).
- **Mock backend** — `core/mock/mock-db.ts` seeds each branch with the package templates whose services are priced and active there, and `package-mock.repository.ts` enforces the same rules (unique names per branch, service/price/home rules, re-activation checks, all-or-nothing delete). Names, totals and duration are derived from the services' CURRENT prices on every read.
- **Permissions** — `Package.View` opens the page; `Create`, `Edit` (drawer + switch) and `Delete` show or hide their actions. The mock `BranchManager` role has `Package.View` only.

## Offers

Implements `API Contract — Offers` (all 6 endpoints) in `modules/offers/`, built as `model → repository (interface + api + mock) → service (signals) → page`.

An offer discounts a bundle of **at least ONE service of ONE branch** for a period (optionally capped by a number of bookings), with a Regular, a VIP and an optional Home price. Like Packages it never moves between branches, so the list shows ONE branch (the first by default, oldest first); there is no "all branches" view.

- **List** (`/main/offers`) — branch selector, **status tabs with counts**, search (Arabic or English name), 12 per page, newest start date first. Tabs: *All* (no `statuses`), *Active* (`[0]`), *Scheduled* (`[1]`), *Ended or full* (`[2, 3, 4]` — the key is repeated). The counts come from `meta.additionalData` and cover the whole branch: they ignore the search and the selected tab, so they stay real when a tab is empty. They are hidden until the first response (no misleading zeros).
- **Card** — 16:9 banner (placeholder icon when there is none or it fails to load), status badge, date range (*No end* when open), **Save 22%** (the API's `savingPercent`) over the banner, the services, a row per price with the services' total struck through (or *In branch only*), and the bookings line (*0 / 50*, or *0 · No limit*).
- **Status** — `0` Active, `1` Scheduled, `2` Ended, `3` LimitReached, `4` Stopped. The backend calculates it from the dates (Cairo time) and the stop flag; the UI only displays it. Colour is never the only signal: every badge has text.
- **Stop / Resume** — `PATCH /offers/{id}/toggle-status` (no body), gated by `Offer.Edit` (the contract has no separate permission). It is a button on the card, hidden on *Ended* offers (the contract doesn't say; there is nothing left to stop). Stopping hides the offer from the app immediately; resuming can be refused (a service is no longer active in the branch, or the home price is no longer allowed) and the interceptor shows why. No confirmation dialog: it is reversible.
- **Create / edit** (drawer on the list, `Offer.Create` / `Offer.Edit`) — banner (optional JPG/PNG/WebP up to 5 MB, 1200 × 675 recommended; local preview, *Remove banner*), Arabic + English names (≤ 100, may repeat), start and end date (native date pickers), max bookings (1–100,000, empty = no limit), the shared service picker, the **Before discount** box and the prices with a live **Save %** pill. Inline validation mirrors the contract (`model/offer.model.ts` limits): every price > 0, ≤ 100,000, ≤ 2 decimals and **lower than its total**; a home price only while every chosen service allows home visits (empty = in branch only); the start date today or later **on create only** (a running offer must stay editable); the end date on or after the start. The branch is shown locked and sent only on create. A service the offer has but that was deactivated since is listed as "no longer active" and must be removed before saving.
- **Dates** — plain `yyyy-MM-dd` strings, never `Date` objects, so the browser's time zone can't shift a day. "Today" for the start-date rule is computed in **Cairo time** (`utils/offer-dates.util.ts`), as the contract says.
- **Banner on save (multipart)** — create sends the file or nothing; edit sends a new file to replace it, `RemoveImage=true` (and no file) to remove it, or neither to keep it. `ServiceIds` is repeated; an unset home price, end date or max bookings goes out empty. Field names are PascalCase like Barbers (`utils/offer-form-data.ts`, unit-tested).
- **Delete** — from the card, behind a confirmation → `DELETE /offers` with `{ ids }` (bulk, all-or-nothing, banners are deleted too; the UI deletes one at a time).
- **Mock backend** — `core/mock/mock-db.ts` seeds every branch with offers covering Active, Scheduled, Ended and Stopped (with and without banner, end date or booking limit); `offer-mock.repository.ts` enforces the contract rules (names may repeat, ≥ 1 distinct active service, price and home rules, dates, 1–100,000 bookings, banner type and size) and re-checks the services on resume. Not simulated: `bookingsCount` is always 0 and status `3` never appears (the contract says so until the bookings module exists). If an offer is both stopped and past its end date the mock shows *Stopped* — the contract doesn't say which wins.
- **Permissions** — `Offer.View` opens the page; `Create`, `Edit` (drawer + Stop / Resume) and `Delete` show or hide their actions. Not included yet: *Send notification* (planned with the notifications module).

### Offers accessibility

- The status tabs are a WAI-ARIA tablist bound to one `role="tabpanel"` (`aria-controls` / `aria-labelledby`); arrow keys move focus and flip in RTL.
- A polite live region announces *"Showing 12 of 30 offers"* (or *"No offers found"*) after every tab, search or branch change, and stays silent while loading and after a failed load, so a result is announced as a change even when the text repeats.
- Card buttons are named after their offer (*"Stop offer Weekend Offer"*, *"Edit offer …"*, *"Delete offer …"*) and still contain their visible text. The offer name is the card's heading and labels its `article`.
- After a successful stop, delete or save, if the card that had focus is no longer in the list (e.g. *Stop* on the *Active* tab), focus moves to the offers panel instead of dropping to the page body.
- The drawer and the delete dialog trap focus, close on Escape and return focus to what opened them. After a failed validation focus jumps to the first invalid field or the service picker.
- The *Save %* pill over the banner has an opaque backing, so its contrast never depends on the picture. Status badge and pill colours measure 5.2:1 or better in both themes (WCAG AA).
- Banners are decorative (`alt=""`): the name next to them says what the offer is. Dates in forms are `dir="ltr"` inside RTL pages; card text uses logical properties (`inset-inline-*`) so it mirrors correctly in Arabic.

## Bookings

Implements `API Contract — Admin Bookings` (Get Bookings, Get Booking By Id, Complete Booking) and its additions — `Admin Booking Cancellation` (Cancel Booking) and `Admin Booking Actions` (Mark No-Show, Mark Booking Refunded, Reassign Booking Barber) — in `modules/bookings/`, built as `model → repository (interface + api + mock) → service (signals) → pages`. Payment reviews share its enums and building blocks (next section).

The pages show ONE branch (the first, oldest, by default — there is no "all branches" view), because the counters belong to one branch. Like Offers and Packages, **opening a page again starts it clean**: the tab, search, filters and page are reset and the widgets are empty; only the selected branch is kept.

- **List** (`/main/bookings`) — period tabs *All / Today / Upcoming / Past* (the *Today* tab carries the branch's count), a **Refund waiting N** chip (a one-click shortcut for the refund filter; N is the branch's refunds still owed), search (booking number as `#OD-000482`, `OD-000482` or `482`; customer name; phone), barber, type and status selects, an inclusive **From / To** date range, *Clear filters*, 20 per page. Today and Upcoming are ordered soonest first, All and Past newest first. The counters come from `meta.additionalData` and ignore the other filters, so they stay put while you filter; they are hidden until the first response (no misleading zeros).
- **Row** — number (a real link) with a VIP / Home badge, date and time, customer with a call link, services, barber, amount and method, status (**Started** when `isInProgress`) and, for Cancelled / Expired / Missed bookings, the refund line (*Refund waiting · EGP 96*) and the missed-booking fee (*EGP 24 fee*). On narrow screens the same data is a card.
- **Status** — `0` Waiting for branch, `1` Confirmed, `2` Rejected, `3` Expired, `4` Completed, `5` Missed, `6` Cancelled. Type `0` Regular, `1` VIP, `2` Home. Payment `0` InstaPay, `1` Mobile wallet. Refund `0` Waiting, `1` Sent. Every badge has text; colour is never the only signal.
- **Details** (`/main/bookings/:id`) — header (number, long date, time, status, type, duration), **Appointment** (barber with rating or *No reviews yet*, chair, branch, home address for Home), **Services & payment** (each service with duration and price, subtotal, method, total), **Refund** (status, amount, fee — only when the booking has one) and **Customer** (name, call link, completed visits, missed bookings).
- **End session** — `PATCH /bookings/{id}/complete`, gated by `Booking.Manage` and shown only while the server says `actions.canComplete`. It asks for confirmation, then the booking is **re-read** so the status and the allowed actions are the server's — after a failure too (`409` "hasn't started yet" / "not allowed for the current status", `404`): what the page showed was out of date. A Confirmed booking that hasn't started says *You can end the session once it starts.* A missing booking (`404`) gets its own message, not a retry. Confirmed bookings left open are completed automatically 2 hours after they end (the backend's rule).
- **Dates** — `startAt` is salon-local (Cairo) time WITHOUT an offset. It is never passed to `new Date()`: `utils/booking-dates.util.ts` splits and formats it as a pure calendar value, so the browser's time zone can't move the day or the hour.
- **Mark as missed** — `PATCH /bookings/{id}/no-show`, next to *End session* (the same rule: a Confirmed booking that has started, so it shows whenever `actions.canComplete` is true). It asks for confirmation; the booking becomes **Missed** and the price minus the no-show fee (`AppSetting.NoShowFeePercent`; the mock uses 20%) is owed.
- **Cancel booking** — `PATCH /bookings/{id}/cancel`, `Booking.Manage`, shown while `actions.canCancel` (pending / confirmed and not ended; an in-progress booking can be cancelled too). A dialog (the same one Reject uses) asks for the **reason**: required, max 500 characters, **the customer sees it as written**. The booking becomes Cancelled, its barber / chair time is freed and a **full refund** is owed. Use Reject instead when the transfer itself is invalid (no refund).
- **Change barber** — `PUT /bookings/{id}/barber`, `Booking.Manage`, shown while `actions.canReassign` (pending / confirmed and not ended). The dialog lists the **active barbers of the booking's branch** (`branch.id` of the details; the booking's own barber, `barber.id`, is left out); whether one is free at that time is only known to the server, so the `409` "isn't available" is the check (there is no endpoint that lists the available barbers). Chair, time and price stay.
- **The customer is not notified automatically** (no notifications module): the cancel and change-barber dialogs say so, and the customer card keeps its call link — call them.
- **Cancellation card** (Cancelled bookings only) — who cancelled (*The customer* / *The branch · Mona Ibrahim*), when (`cancelledAt` is UTC, shown in Cairo time) and why (the reason the staff wrote, or the one the customer picked: change of plans / booked by mistake / wants another time / other; blank when the customer gave none).
- **One customer's bookings** — `/main/bookings?customerId=1203` (the *All bookings (N)* link of the customer profile) lists that customer's bookings in **every branch**: the branch and barber filters give way to a chip (*Showing bookings of …* with *Show all*), no `branchId` is sent and the counters narrow to the customer. The other tabs and filters still combine with it.
- **Customer profile link** — the customer card links to `/main/customers/:id` for users with `Customer.View`.
- **Refund sent** — `PATCH /bookings/{id}/refund`, `Booking.Manage`, a button in the **refund card** while `actions.canMarkRefunded` (a Cancelled / Expired / Missed booking whose refund is still Waiting). The branch returns the money to the customer **outside the app** (cash or the same payment method); this only RECORDS it, so it asks first (the amount and the customer are named) — it **can't be undone** (a second try answers `409` "already marked as paid"). The booking's status doesn't change: `refund.status` becomes Sent, the booking leaves the *Refund waiting* filter and the counters are re-read from the server. Only the details page has it: the list response carries no `canMarkRefunded`, so the *Refund waiting* chip is how you reach those bookings.
- The status filter sends ONE status from the UI (the service and the query builder accept a list — the key is repeated, `?statuses=1&statuses=4`).
- **Accessibility** — tabs ↔ panel (`aria-controls` / `aria-labelledby`), a polite live region (*Showing 9 of 9 bookings*), table caption, `aria-pressed` on the chip, booking numbers, phones and dates stay left-to-right inside RTL.
- **Permissions** — `Booking.View` opens the list and the details; `Booking.Manage` shows *End session*, *Mark as missed*, *Cancel booking*, *Change barber* and *Refund sent*. The mock `BranchManager` has `Booking.View`, `Booking.Review` and `Booking.Manage`; sign in as `receptionist@odel.com` to try a user who can look but not act (`View` / `Cancel` only). `Booking.Cancel` is in the catalog but the contracts don't use it (cancelling needs `Booking.Manage`).

## Payment reviews

Implements the review half of the same contract (Get Payment Reviews, Approve Booking, Reject Booking) in `modules/payment-reviews/`.

- **Queue** (`/main/bookings/payment-reviews`) — tabs *To review / Approved today / Rejected today*, each with the branch's count; *Review time 30 min* (from `reviewTargetMinutes`, hidden when the server doesn't send it). To review is ordered by start time (an unreviewed booking **expires at its start time**); the reviewed tabs, latest review first.
- **Card** — `#id` (this list has no booking number), the payment status, the waiting time with a *Late* badge, the screenshot, the **amount due** and the booking details — see *The review card* below.
- **Approve** (`Booking.Review`) — asks for confirmation that repeats the amount due and the method, then `PATCH /bookings/{id}/approve`: PendingReview → Confirmed. `409` when the booking isn't PendingReview or its start time passed.
- **Reject** (`Booking.Review`) — a dialog asks for the **reason**: required (blank counts as empty), max 500 characters (typing and pasting, with a live counter), shown to the customer, and it starts empty every time. `PATCH /bookings/{id}/reject` frees the barber's and chair's time.
- **Stays fresh** — the queue is time-critical, so it reloads **quietly** (rows stay, no skeleton, a failed background reload is ignored): every 60 seconds while the tab is visible, when the tab regains focus, and from the *Refresh* button, which shows *Updated 12:05 PM* in salon time. After approve / reject it reloads either way — a `409` / `404` means someone else got there first. Only the booking being saved is locked, so other cards stay usable.
- **Proof viewer** — Escape, the backdrop or the close button close it; focus is trapped inside and restored; *Open original* shows only for real web addresses.
- **Read-only without `Booking.Review`** — the queue and the screenshots stay visible, the Approve / Reject buttons don't.
- **Mock backend** — `core/mock/mock-bookings.ts` seeds **9 bookings, ONE per status**, all in the first branch (Zamalek; the other branches have none), with dates relative to *now* in Cairo, so every state is easy to find, review and test: **401** waiting for a review (39 min — late), **402** Confirmed (VIP, approved today, starts in 2 h), **403** Confirmed and *Started*, **404** Rejected today (its screenshot shows LESS than the total), **405** Expired (full refund owed), **406** Completed, **407** Missed (refund owed minus the fee), **408** Cancelled by the customer (refund sent), **409** Cancelled by the branch (refund owed). The open ones (401-403) belong to the first and third barbers, so the second one can leave freely. There is no Home booking in the seed (the first branch doesn't take Home); tests make one when they need it. Screenshots are generated receipt images (`data:` URLs — offline, no files). The mock applies the backend's time rules before every call (unreviewed → **Expired** at the start time with a full refund owed; open Confirmed → **Completed** 2 h after the end) and the contract's errors (`400` empty / over-long reason or `dateTo < dateFrom`, `404`, `409`). **Bookings, payment reviews and the barbers' attendance share one database**: rejecting a waiting booking or ending a session frees a present barber.

### The review card (redesign)

A **balanced two-column card** built only from the existing tokens and shared components (works in light / dark and LTR / RTL):

- **Header** — the booking id (`#489`) with its VIP / Home badge, the **payment status badge** (*Waiting for branch* on To review; Confirmed / Rejected on the reviewed tabs), the **waiting time** and the **Late** badge (only when the proof has waited past the review target).
- **Body** — left: the payment proof (a button, always showing a *Zoom* chip, opens the large viewer); right: the **amount due** as the most prominent figure (display face, tinted band), then a plain two-column grid — customer, phone, payment method, services, date, start time — with no boxes around the facts. Below 480px the proof moves on top and the details follow.
- **Footer** — under a subtle divider: **Reject** (danger) and **Approve** (primary), both `fullWidth` in equal grid cells so their size and alignment match.
- The footer is shown only when the user may review **and** the cards on screen are the *To review* ones.

### Actions never flash on the wrong cards

The selected tab changes the instant it is clicked, but the cards change only when their response arrives. The buttons used to follow the selected tab, so clicking *To review* from another tab put Reject / Approve on that tab's cards until the response landed. The fix is in the state, not in CSS:

- the service keeps **`itemsTab`** — the tab the cards on screen were loaded for (set from the response, `null` while none are);
- **clicking another tab clears the cards** (and `itemsTab`) at once, so the skeleton shows instead of another tab's cards; the badges stay (they belong to the branch);
- the page's `canAct` is `canReview && tab === ToReview && itemsTab === ToReview`;
- a *quiet* reload (the one after an approve / reject) is only quiet while the cards on screen belong to the tab it reloads — after a tab click it is a normal load, so it can't leave an empty state behind.


## Customers

Implements `API Contract — Customers` (Get Customers, Get Customer By Id) in `modules/customers/`, built like Bookings: `model → repository (interface + api + mock) → service (signals) → pages`. Customers are the app users who registered and verified their email (staff never appear).

- **List** (`/main/customers`, `Customer.View`) — tabs *All / Visited this month / Has missed bookings / Not back in 60 days*, each with its count; a **branch** select that defaults to **All branches** (unlike Bookings the branch is optional: with none, every customer is listed and the numbers cover all branches; with one, only the customers who booked there are listed and every number — and the tab counts — count that branch only); a name / phone search; 20 per page. The tab counts come from `meta.additionalData` and ignore the search. Opening the page again resets the tab, search and page (the selected branch is kept).
- **Row** — avatar and name, phone (a left-to-right `tel:` link), visits (completed bookings), last visit (*Today* / *Yesterday* / a date / *Never*) and missed bookings (highlighted when there is one). A row opens the profile; narrow screens show cards.
- **Profile** (`/main/customers/:id`) — name and *Customer since* (UTC `createdAt`, shown in Cairo time), **Visits** and **Missed** cards (with the date of the last no-show), the **latest 5 bookings** (booking number linked to its details, services, amount, barber · branch, status or *Started*, who cancelled, the refund line and fee, the rating) and the contact card (call and email links). *All bookings (N)* opens `/main/bookings?customerId=…`. Everything covers all branches. A missing customer (`404`) gets its own message, not a retry.
- **Not built, on purpose** (the contract says so) — points, total paid, blocked tab, repeated no-show badge, Excel export, addresses, block from booking.
- **Mock backend** — shares the bookings database: the 9 customers with a booking (plus two who never booked) get their visits, no-shows and last visit from the same bookings the Bookings screens show. Ratings of completed bookings are made up from the booking id. The *Not back in 60 days* tab is empty with the seed (its oldest booking is three days old); the logic is covered by tests.

## Loading states of the list pages

One strategy for every list page: **skeleton → data / empty / error**, never *empty → skeleton → data*.

- **Skeleton** from the first moment: the page is *loading* from the instant it opens until its first response. That includes the time the **branch options** are still loading, before the list request even starts (Offers, Packages, Services and Customers load the branches first; their `loading` signal covers it — Bookings, Payment reviews and Attendance combine `branchesLoading` with it in their `busy`).
- **Empty state** only after a request **succeeded** and returned nothing (`!loading && !hasError && rows.length === 0`).
- **Error state** when the request failed and there is nothing to show (*Try again*); when rows are already on screen a failed reload keeps them and shows a compact error above.
- **First load vs refresh** — the skeleton replaces the list when there is nothing to show (`loading && rows.length === 0`); a reload with rows already on screen (a refresh, a page change) keeps them and only marks them busy. Rows of **another** view (another tab, filter or search) are cleared when the page opens or the tab changes, so they never show under widgets that were reset.

## Notes and assumptions

- Branch payment methods: `instaPayAccount` (max 100 characters, trimmed) and `walletNumber` (Egyptian mobile in international format) are optional on the branch form; an empty field is sent as an explicit `null` because the API removes a value that is not sent. The branch **list** does not return them.
- Attendance: responses are assumed to match the contract PDF; the localized "has upcoming bookings" message is built from the sheet (`BARBERS.ERRORS.ATTENDANCE_HAS_BOOKINGS`) instead of the server's English text. The page has no success toast on purpose (one line in `BarberAttendanceService.setPresent` if you want one).
- Bookings: `homeAddress` is read as free text (the contract only shows `null`); the booking details carry `branch.id`, `barber.id`, `chair.id` and `actions.canReassign` (the *Change barber* dialog needs them); the payment-review list carries no `bookingNumber`, so cards show `#<id>`; page size is the contract's default 20 (max 100). `meta.additionalData` counters are the selected branch's only. The mock treats a booking whose start time passed while unreviewed as Expired — the contract says the backend does this at the start time.
- The AlSalam README says Angular 22 / PrimeNG 19; its `package.json` and lockfile say Angular 21 / PrimeNG 21. The latter were followed.
- The reference had no `fileReplacements`, so production builds silently used the dev environment. Fixed here.
- Build-time font inlining is off (it needs network access to Google Fonts and breaks offline CI); fonts load from the `<link>` in `index.html`.
- Users and Roles management is not in the sprint plan; it is placed in Sprint 1 next to admin login. Move it if the team disagrees.
- **The dashboard was removed for now** (the backend has no dashboard endpoint yet). When the endpoint exists, restore it as a module with its own repository token, route, sidebar item and `DASHBOARD.*` translations, and drop `homeRedirectGuard` from the `/main` route.
- Auth contract items marked "assumption" there are assumed here too: logout/refresh/change-password/profile-update response bodies, `401` on an invalid refresh token, `400` on a wrong current password.
- Change password keeps the current session (the contract doesn't say tokens are revoked). If the backend revokes them, the next request 401s and the interceptor signs the user out.
- Phone number is optional (6–15 digits when filled); the contract doesn't say whether it is required. Photo limits (2 MB, JPG/PNG/WebP) are a client-side default — align them with the backend's real rules.
- Set `apiUrl` and `useMock: false` in `src/environments/environment.ts` to run against the real backend (the backend must allow CORS for the dev origin and the `lang` request header).
- `GET /users/{id}` returns the role **name**, not its id, so the edit form maps the name back to an id through the roles list (`GET /roles?PageSize=100`). If role names aren't unique this is ambiguous — ask backend to return `roleId` too.
- Deleting a role that still has users is *allowed* by the UI (with a warning); the contract says the backend may refuse, and its message is shown.
- Success toasts use the app's own translated messages, not the backend's English `message`; error messages come from the backend.
- Barbers: the list endpoint returns no summary data, so there are no stat cards; the page size is 10 (contract default 20, max 100). Photo limit is 5 MB per the Barbers contract (profile photos stay at the 2 MB client-side default).
- Page size is fixed at 10 (the contract's default). Create-user requires every field, including phone (contract: "all fields are required").
- Offers: the banner limit (5 MB, JPG/PNG/WebP, 1200 × 675 recommended) and every field rule come from the Offers contract; the card grid, the 12-per-page size and "first branch by default" follow Packages. The mock treats Stopped as winning over Ended, and allows Stop on any status — the card hides it on Ended offers. A banner that fails to load shows the placeholder instead of a broken image.
