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
    shared/               components/ (button, inputs, badge, stat-card, data-table, modal, states…),
                          model/, utils/, validators/
    modules/
      auth/               login · forgot password · OTP · new password · success
      users/              list + filters + bulk delete · create/edit drawer · status switch
      roles/              list · role details (permission matrix)
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
- **Mobile Users cards** — below 768px, the Users table (`modules/users/pages/users-list/users-list.html`) renders as cards instead of a horizontally-scrolling table, through a new generic, optional `odlCard` template on `DataTableComponent` (`shared/components/data-table/`). Same data, same server-side selection/pagination/permissions — nothing duplicated. Every other table (Roles, future ones) is unaffected since the feature is opt-in per usage.

Known remaining findings (moderate/minor, pre-existing, not touched this round — out of scope per this change's instructions): the auth pages (`/login`, `/forget-password`) have no `<main>` landmark and no level-one heading; the sidebar's two `<nav>` regions aren't uniquely labelled; the sortable/empty table header cell has no visible text for screen readers. None are regressions from this change.

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
- Page size is fixed at 10 (the contract's default). Create-user requires every field, including phone (contract: "all fields are required").
