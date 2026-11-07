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
| Export | `exceljs`, `file-saver`, browser print-to-PDF |

`package-lock.json` is carried over from the reference, so `npm install` resolves the same versions.
Removed because Odel has no use for them: `pdfjs-dist`, `qrcode` and the `postinstall` PDF-worker copy.

## Run

```bash
npm install
npm start            # http://localhost:4200 — mock data (environment.useMock = true)
npm run build        # production build (real API, design-system page hidden)
npm test
```

**Mock sign-in** (any password with 6+ characters; OTP code is `1234`)

| Email | Role | Access |
|---|---|---|
| `admin@odel.com` | SuperAdmin | everything |
| `manager@odel.com` | BranchManager | operations only — sidebar hides the rest, direct URLs land on *No access* |

Set the real API in `src/environments/*.ts` (`apiUrl`) and flip `useMock` off.

## Structure

```
src/
  brands/odel/            ← build-time identity: _brand.scss, brand.ts, assets/logo-mark.svg
  brands/_template/       ← starting point for the next client
  styles/                 ← design tokens (see below)
  app/
    core/                 guards, interceptors (token, lang, error), services (theme, language,
                          notification, network, export…), auth/permissions.ts, theme/odel-preset.ts
    layout/               auth-layout, main-layout (sidebar, header, breadcrumbs, nav.config.ts)
    shared/               components/ (button, inputs, badge, stat-card, tabs, data-table, modal, states…),
                          model/, utils/, validators/
    modules/
      auth/               login · forgot password · OTP · new password · success
      users/              list + filters + bulk delete · create/edit drawer · status switch
      roles/              list · role details (permission matrix)
      branches/           cards · create/edit pages · details · visibility switch
      chairs/             cards + summary · create/edit drawer · status switch
      barbers/            table + filters + bulk delete · create/edit drawer with photo · status switch
      services/           price table per branch + summary · create/edit page (price card per branch) · bulk tools
      packages/           cards per branch + summary · create/edit drawer (service picker, "Before discount") · status switch
      offers/             status tabs + cards per branch · create/edit drawer (banner, dates, service picker, "Before discount") · stop / resume
      dashboard/          model · repository (api + mock) · service · page
      profile-management/ profile + change password
      design-system/      living reference page (dev only)
      no-access/ not-found/
      main.routes.ts      the full route map
  core/mock/mock-db.ts    one in-memory "database" shared by every mock repository
```

Feature modules follow `model → repository (interface + api + mock) → service (signals) → pages`. Pages never call a repository directly.

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
npm run build:template-brand   # builds with src/brands/_template instead of odel
```

To add a client: copy `_template`, edit it, and add a configuration next to `brand-template` in `angular.json`.

## Auth, roles and permissions

Implements `API_Contract_Authentication.md` (all 9 endpoints). Email + password with refresh token, cross-tab session sync and a silent 401 → refresh → retry.

| Endpoint | Where it lives |
|---|---|
| `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh-token` | `AuthService` → login page, header, error interceptor |
| `POST /auth/password/forgot` → `/verify` → `PATCH /reset` | forgot-password → 4-digit OTP → new-password pages |
| `PATCH /auth/password/change` | `AuthService.changePassword()` → Profile → Password card |
| `GET /auth/profile` · `PUT /auth/profile` (multipart) | `ProfileService` → Profile page |

- The backend returns `role` and `permissions[]` at login and on every refresh. Permissions are `Resource.Action` strings defined once in `core/auth/permissions.ts` (e.g. `User.View`); use `PERMISSIONS.User.Edit`, never a raw string.
- Routes: `canActivate: [permissionGuard]` with `data: { permission }`. The sidebar filters by the same permissions, so a user only sees what they can open.
- **The dashboard and profile only require being signed in.** The backend currently grants only `User.*`; gating the dashboard on a permission it doesn't issue would bounce every real admin to *No access*. Add new keys to `permissions.ts` as the backend introduces them.
- Breadcrumbs build themselves from route `data.breadcrumb`.

### Profile page (`/main/profile`)

- Personal details: full name, email, country + phone. Photo: JPG/PNG/WebP up to 2 MB, with preview; it is only uploaded when you press *Save changes*.
- After saving, the profile is refetched (the PUT returns no body) and the header name and avatar update instantly.
- Password: current + new + confirmation, with the same five-rule policy and strength meter as the reset flow (`shared/validators/password-policy.validator.ts`).
- Wire format for the update is PascalCase `multipart/form-data` (`FullName, Email, CountryCode, PhoneNumber, Image, RemoveImage`) — see `modules/profile-management/utils/profile-form-data.ts` (unit-tested).

## Route map

Only sections that exist are routed and shown in the sidebar. When a new feature lands, add its route (`modules/main.routes.ts`), its sidebar item (`layout/main-layout/nav.config.ts`) and its permission keys (`core/auth/permissions.ts`) together.

| Page | Route | Permission |
|---|---|---|
| Dashboard | `/main` | sign-in only |
| Users | `/main/users` | `User.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Roles & permissions | `/main/roles` | `Role.View` (+ `Create` / `Edit` / `Delete`) |
| Role details (permission matrix) | `/main/roles/:id` | `Role.View` (editing needs `Role.Edit`) |
| Branches | `/main/branches` | `Branch.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Chairs | `/main/chairs` | `Chair.View` (+ `Create` / `Edit` / `ToggleStatus` / `Delete` for the actions) |
| Barbers | `/main/barbers` | `Barber.View` (+ `Create` / `Edit` / `Delete` for the actions) |
| Services (Menu & services) | `/main/services` | `Service.View` (+ `Edit` for the status switch and bulk tools, `Delete` for delete) |
| New service | `/main/services/new` | `Service.Create` |
| Edit service | `/main/services/:id/edit` | `Service.Edit` |
| Packages | `/main/packages` | `Package.View` (+ `Create` / `Edit` for the drawer and the status switch, `Delete` for delete) |
| Offers | `/main/offers` | `Offer.View` (+ `Create` for "Add offer", `Edit` for the edit drawer and Stop / Resume, `Delete` for delete) |
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
- **Permissions** — `Barber.View` opens the page; `Create`, `Edit` (also the status switch) and `Delete` show or hide their actions. The mock `BranchManager` role has `Barber.View` only; `SuperAdmin` has everything.

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

## Notes and assumptions

- The AlSalam README says Angular 22 / PrimeNG 19; its `package.json` and lockfile say Angular 21 / PrimeNG 21. The latter were followed.
- The reference had no `fileReplacements`, so production builds silently used the dev environment. Fixed here.
- Build-time font inlining is off (it needs network access to Google Fonts and breaks offline CI); fonts load from the `<link>` in `index.html`.
- Users and Roles management is not in the sprint plan; it is placed in Sprint 1 next to admin login. Move it if the team disagrees.
- Dashboard numbers are mock data. **There is no dashboard endpoint in the backend contract yet**, so against the real API the dashboard shows its "couldn't load" state (the shell, sidebar and profile work normally).
- Currency is shown as EGP — change it in `dashboard.ts` / the future shared formatter if needed.
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
