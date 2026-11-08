# Step 02 — Project Architecture Standard

Project: `odel-salon-admin` (Angular 21, PrimeNG 21, signals, ngx-translate, Vitest)
Status: **APPROVED (with decisions D1–D17 answered).** Step 03 is applying it; see `../step-03/step-03-change-log.md`. Corrections found while implementing are marked "Corrected in Step 03"; N14 was fixed in the stand-alone D17 change.
Scope: read-only. No application source, dependency, configuration or test file was changed in this step.

Companion documents (same folder):

- `step-02-module-comparison.md` — module-by-module matrix and required alignment
- `step-02-implementation-roadmap.md` — ordered plan, plus the disposition of **every** Step 01 finding
- `step-02-decisions-required.md` — decisions that are yours to make

---

## 0. How this was done, and its limits

| Method | Done? | Notes |
|---|---|---|
| Read the source of all eight CRUD modules end to end (model → repository → service → page → form) | Yes | Offers, Packages, Branches, Chairs, Services, Barbers, Users, Roles. Chairs, Offers, Branches, Users and Roles were read line by line; Packages, Barbers and Services were compared against them by structure, signatures and targeted reads. |
| Re-verified Step 01 claims by grep / reading | Yes | Results in §0.1. |
| Production build (`ng build`) in a **scratch copy** (never the deliverable tree) | Yes | Used only to check the mock-in-production claim (§0.1, N1). |
| Test suite re-run | **No** | The 1128 / 25 figures in Step 01 are carried over, not re-measured here. |
| Real browser / real backend | **No** | Nothing in this document is a visual or live-API finding. |

Tags used below: **[S]** = supported by what the code already does in at least one module, **[P]** = new proposal, no module does this yet.

### 0.1 Step 01 claims that I re-checked

| Step 01 claim | Result |
|---|---|
| Two DI patterns (token vs service-level switch) | **Confirmed.** 6 modules use tokens in `app.config.ts`; users, roles, dashboard, profile and auth switch inside the service. |
| Mock code and the any-email SuperAdmin login ship in the production bundle | **Confirmed**, with one correction (N1 below). |
| Page sizes 10 / 12 / 20 | Confirmed. |
| Stale-response guard only in 6 services; `status:false` only handled in 6 | Confirmed (`requestId` and `!res.status` grep). |
| Single `saving` boolean in every list service | Confirmed (`set(true)` / `finalize(set(false))` in all 9 services that mutate). |
| Handlers don't re-check permission | Confirmed, with nuance: `openEdit` / `openTool` **do** check `canEdit()` in 6 of 8 list pages. The gap is `toggle`, `askDelete`/`confirmDelete`, `openCreate`. |
| 64 components, all OnPush + standalone; 86 `subscribe` vs 13 `takeUntilDestroyed` | Confirmed. |
| Dead code has no importers (`ExcelExportService`, `PrintExportService`, `FeaturePlaceholder`) | Confirmed. |
| 50 CRLF files; no ESLint / Prettier / `.editorconfig` | **Corrected in Step 03:** only **2** of 399 files under `src/` had CRLF (`branches/utils/branch-form.validators.ts` and `branch-form.factory.ts`). Step 01's "50" was wrong, and my "confirmed" in this step came from a faulty shell check. No ESLint / Prettier / `.editorconfig` was correct. |
| **"0 non-null assertions in source"** | **Incorrect.** There are 11 lines in 5 files (below). |

**Corrections and new findings from this step** (none of these were fixed):

| # | Finding | Evidence |
|---|---|---|
| **N1** | **Token-based DI does not keep mocks out of production either.** `app.config.ts` does `useClass: environment.useMock ? XMock : XApi`. `environment.useMock` stays a runtime property in the bundle (`useMock:!1`), so both classes are bundled. Mock-only literals from token-based modules (`"Chair not found"`, `"Offer not found"`) are in the **initial** `main-*.js`; the mock login (`startsWith("manager")` → BranchManager, else SuperAdmin) is in a chunk the main bundle references. **Consequence: Step 01's M1 ("unify on tokens") is necessary but not sufficient.** The standard needs a build-time swap mechanism (§5.1). | `ng build` in a scratch copy, grep of `dist/` |
| **N2** | Non-null assertions exist: `users-list.ts:142`, `barbers-list.ts:182` (`this.editDetails()!.id`), `role-details.ts:67`, `adjust-prices-form.ts:185,186,240`, and 5 lines in `service-mock.repository.ts`. | grep |
| **N3** | `UsersList.openEdit` has no stale-details token (barbers, chairs, offers have `drawerToken`). Closing the drawer and opening another can let a slow response from the first overwrite it. *Inferred from the missing guard; not reproduced.* | code reading |
| **N4** | Form `submit()` has a `saving()` guard in 5 of 8 forms (chair, package, offer, branches page, services page). Missing in barbers (BA-01), **users** and **roles**. | grep |
| **N5** | `toggle()` has no `saving()` guard in barbers and users; branches, chairs, packages, offers do. | code reading |
| **N6** | `role-form` uses `Validators.required` only, so a whitespace-only name is "valid", then trimmed to `""` and emitted. Same class as BA-02/CH-01 — and by reading, **every** form validates `required`/`maxLength` on the untrimmed value (branches and services factories too; only chair/package/offer/barber add a `notBlank`). It also seeds its value with `queueMicrotask` in the constructor instead of `ngOnInit`. *Not reproduced at runtime.* | code reading |
| **N7** | The `notBlank` validator is copy-pasted into `chair-form.ts`, `package-form.ts`, `offer-form.ts` (barbers has its own in `barber-form.validators.ts`). | grep |
| **N8** | `service-picker` lives in `modules/services/components/` but is used by Offers and Packages: a feature module is acting as shared UI. | imports |
| **N9** | Two permission-gating styles in templates: `*appCan` (1 use each in users-list and roles-list) vs `@if (canX())` computed flags (66 uses everywhere, including users and roles). | grep |
| **N10** | Only `Chair` has a `ToggleStatus` permission. Every other module's status toggle is gated by `Edit` (Offers documents this explicitly as "contract has no separate permission"). Whether that is the backend contract can't be concluded from code. | `permissions.ts` |
| **N11** | `PERMISSIONS` is read lazily (`computed`) with a comment that eager reads "came back undefined in combined test runs". Root cause is not documented; it smells like a module-import cycle. | code comments |
| **N12** | Step 01 **S4** (services/components "half-organised") is mostly **intentional**: `bulk-form.scss` is a stylesheet shared by three sibling components via `styleUrls`, which is why `copy-prices-form` has no `.scss` of its own. I downgrade S4 from "inconsistency" to "undocumented but legitimate pattern". | code reading |
| **N13** | Step 01 **A2** (PascalCase on users/roles) looks deliberate: `user-query.ts` says "PascalCase names the backend binds", and the README documents PascalCase for the multipart forms. It is a **contract question**, not a defect (see Decision D3). | code comments, README |

| **N14** | **`npm run build:template-brand` ships a mock-enabled build.** That script runs `ng build --configuration production,brand-template`. The `brand-template` configuration defines its own `fileReplacements`, which **replaces** (does not merge with) the `production` one, so `environment.ts` is never swapped for `environment.prod.ts`. Reproduced in a scratch copy: the resulting bundle contains `useMock:!0`, `production:!1` and `showDesignSystem:!0` (the default `ng build` correctly has `useMock:!1`, `showDesignSystem:!1`). So that build runs on mock data, accepts any email on the login screen (any non-`manager…` email becomes SuperAdmin), and exposes the design-system page. I verified the flags in the bundle; I did **not** run the app, and I don't know whether that script is used for deployments. | `ng build --configuration production,brand-template` in a scratch copy |

---

## 1. Architecture overview (what exists today)

**Stack:** Angular 21 standalone components, signals, `@if/@for` control flow, PrimeNG 21 + own design-system components in `shared/`, Tailwind 3 + SCSS tokens, ngx-translate (EN/AR, 868 keys each), Vitest through `@angular/build:unit-test`. Strict TypeScript and `strictTemplates`.

```
src/app
├─ app.config.ts          providers: router, HTTP + interceptors, PrimeNG, i18n, 6 repository tokens
├─ app.routes.ts          auth shell · /main shell (authGuard) · no-access · 404
├─ core/                  auth (permissions), guards, interceptors, services, theme, brand, mock/mock-db
├─ shared/                components (20), directives, model/api_response, utils, validators
├─ layout/                main-layout (sidebar, header, breadcrumbs), auth-layout
└─ modules/
   ├─ main.routes.ts      ALL /main routes in one file (lazy loadComponent per page)
   └─ <feature>/          model · repository · service · pages · components · utils
```

**Layering that already works well [S]:**

```
Page (list/details/form-page) ──► Feature service (root singleton, signals) ──► Repository (interface + token)
        │                                  │                                        ├─ Api repository (HttpClient)
        └─ Form component (presentational) │                                        └─ Mock repository (mock-db)
                                           └─ NotificationService (success toasts)
Error toasts for failures: error.interceptor (not the service)
```

Positive findings I verified and want to **keep**: strict typing; zero `any`; zero decorator inputs/outputs and zero constructor injection; zero `*ngIf/*ngFor`; uniform `Observable<ApiResponse<T>>` repository contracts; pure, unit-testable query builders (`buildXParams`); `drawerToken` and `requestId` race guards; centralised error toasts; `status:false` treated as failure in the six newer services; route guards plus a wiring spec per newer module.

---

## 2. Reference module selection

### 2.1 Scorecard (Offers, Packages, Branches, Chairs)

Ratings are relative to the other three, and reflect what I read, not how new a module is.

| Criterion | Offers | Packages | Branches | Chairs |
|---|---|---|---|---|
| Folder organisation | Good; form loose (S1) | Good; form loose (S1) | **Best** (all components in folders) | Good; form loose (S1) |
| Separation of responsibilities | Strong | Strong | Strong | **Strong, least module-specific noise** |
| Repository architecture / API-mock split | Strong; has api spec | Strong; **no api-repo spec** | Strong; has api spec | Strong; has api spec |
| DI | Token | Token | Token | Token |
| Service logic | **Best** (`mutate(successKey fn)`, `initialize`, branch + tab state) but heavier | Same shape as Offers | Good; `loadOptions`; create/update intentionally don't reload | Lean and complete (summary, filters, `reloadAfterRemoval`) |
| Stale-response / `status:false` | Yes / Yes | Yes / Yes | Yes / Yes | Yes / Yes |
| Signals & state | Strong; `saving` boolean (L4) | Same | Same | Same |
| Component organisation | List page 358 lines (focus mgmt, announcements) | 298 lines | Card + details + full-page form | 315 lines; drawer + filters + summary |
| Form handling | Strong (`saving` guard, `notBlank`, trim) but 417 lines | Strong | Strong (factory/mapper/validators split) | Strong; `saving` guard; locked-branch pattern |
| Validation | Max-length checked before trim (BA-02 class) | Same class | `required`/`maxLength` on raw value in the factory (same class, by reading) | CH-01 (same class) |
| Permissions | `openEdit` checks; `toggle`/`delete` don't (L5) | Same | Navigation + route guard | Same as Offers; **separate `ToggleStatus`** |
| Testing quality | **Best** (14 specs + wiring + api spec) | Lighter (8) | Strong (13 + qa) | Strong (9 + qa) |
| Maintainability / scalability | Good, but its extras (tabs, multipart, focus handling) are not needed by most modules | Good | Good for full-page forms | **Best template for "list + drawer CRUD"** |

### 2.2 Recommendation

**No module is a faithful standard.** Every one of them has the same four gaps (single `saving` boolean, no handler-level permission re-check on toggle/delete, max-length-before-trim, and a mock/API pair that is not isolated from the production build). So the standard is **"the best existing patterns, minus those four gaps"**, not a copy of any module.

| Role | Module | Why |
|---|---|---|
| **Primary reference** (structure, service shape, list page, drawer form) | **Chairs** | The smallest module that still exercises *every* layer: token DI, filters, summary, drawer create/edit, confirm dialogs, toggle, delete with `reloadAfterRemoval`, `drawerToken`, `status:false` handling, `requestId` guard, a `saving`-guarded form, and a deep test suite including the `qa` convention. Nothing in it is there only for one module's special needs, so it is the least likely to teach a wrong habit. |
| **Secondary: branch-scoped lists** | **Offers** (Packages follows it) | Best `initialize()` / `selectBranch()` flow, `mutate()` that takes a success-key function (needed when the toast depends on state, e.g. stop vs resume), the best test suite shape (service spec with token stub, api spec, wiring spec), and the optional screen-reader announcement. Use only for modules whose API lists one branch at a time. |
| **Secondary: full-page forms and details** | **Branches** | `branch-form.factory / mapper / validators` is the cleanest split for complex forms; `loadOptions()` is the model for dropdown sources; has the details page. Use when a form is too big for a drawer. |
| Pattern donors | **Barbers** (multipart `*-form-data`, image and phone utils) · **Users** (`lockedIds` self-protection, selection reset on every query change, conditional password controls) · **Roles** (`permission-matrix` util, dedicated details page) | Domain-specific techniques worth reusing, not structural references. |
| **Not** a reference | Users, Roles (service layer) | Older pattern: service-level DI switch, no stale guard, no `status:false` handling, no form `saving` guard, inline template (roles), almost no tests. |

---

## 3. Canonical folder structure

### 3.1 Tree for a typical CRUD feature (Chairs-shaped)

```
modules/<features>/
├─ model/
│  └─ <feature>.model.ts                    types, enums, constants (name max length, max page size)
├─ repository/
│  ├─ <feature>.repository.ts               I<Feature>Repository + <FEATURE>_REPOSITORY token
│  ├─ <feature>-api.repository.ts           HttpClient, no mapping, no side effects
│  ├─ <feature>-api.repository.spec.ts
│  ├─ <feature>-mock.repository.ts          uses core/mock/mock-db.ts
│  └─ <feature>-mock.repository.spec.ts
├─ service/
│  ├─ <features>.service.ts                  list state + mutations (root singleton)
│  └─ <features>.service.spec.ts
├─ pages/
│  └─ <features>-list/
│     ├─ <features>-list.ts / .html / .scss / .spec.ts
├─ components/
│  ├─ <feature>-card/        (only if the list is a card grid)   .ts .html .scss .spec.ts
│  └─ <feature>-form/        (drawer form)                       .ts .html .scss .spec.ts
├─ utils/
│  ├─ <feature>-query.ts (+ .spec.ts)         buildXParams — pure, mandatory
│  ├─ <feature>-labels.util.ts                localized names, enum → i18n key (when needed)
│  └─ <feature>-summary.util.ts               reads meta.additionalData (when the API returns counts)
├─ <features>.wiring.spec.ts                  route + permission + sidebar item
└─ <features>.qa.spec.ts                      optional: `it.fails` pins for confirmed defects
```

### 3.2 Responsibility of each folder / file type

| Item | Responsibility | Must not |
|---|---|---|
| `model/` | Wire-format types, enums, constants | Import Angular, services or components |
| `repository/<feature>.repository.ts` | The contract: one interface + one `InjectionToken` | Contain logic |
| `*-api.repository.ts` | Translate method calls to HTTP (`buildXParams`, `body`, multipart helpers) | Catch errors, toast, map models |
| `*-mock.repository.ts` | In-memory behaviour that **mirrors the real API's rules** (409s, 404s, validations) | Be the only place a rule exists; diverge from the API (CH-05, XM-01) |
| `service/` | List state (signals), query, stale-response guard, mutations, success toast, reload | Know about drawers, dialogs, routing or forms |
| `pages/*-list` | Wire service signals to template, permission flags, drawer/dialog state, navigation | Build HTTP params, call repositories directly |
| `components/*-form` | Reactive form, validation, normalisation, emit a typed payload | Call services, navigate, toast |
| `components/*-card` | Presentational; inputs + outputs only | Inject services (except translate/language) |
| `utils/` | Pure functions, no DI | Hold state |

### 3.3 Conventions

- **Files:** kebab-case. One folder per component, containing `.ts`, `.html`, `.scss` (and its `.spec.ts`). Always external `templateUrl` / `styleUrl`. [S for cards; **P** to extend to forms — Step 01 I1/I2]
- **Classes:** feature components have **no suffix** (`ChairsList`, `ChairCard`, `ChairForm`) [S: 49 classes]; `shared/` components keep the `*Component` suffix [S: 16 classes]. I do **not** recommend a mass rename (no architectural benefit).
- **Repository naming:** interface `I<Singular>Repository`, token `<SINGULAR>_REPOSITORY`, classes `<Singular>ApiRepository` / `<Singular>MockRepository`, files `<singular>-api.repository.ts`. [S]
- **Service naming:** class `<Plural>Service`, file `<plural>.service.ts`. Mutations `create<Singular>` / `update<Singular>` / `toggleStatus` / `remove`. [S: 6 of 8 modules; users/roles use `create/update` — Decision D5]
- **Spec placement:** next to the file under test; module-wide specs (`wiring`, `qa`, `integration`) at the module root. [S]
- **Shared sibling stylesheet:** allowed (`bulk-form.scss` pattern) when 2+ sibling components share layout; name it with a leading underscore if it is only ever `@use`d. [S]
- **Routes:** keep all `/main` routes in `main.routes.ts`. Wiring specs depend on `MAIN_ROUTES.find(...)`; per-feature route files add no benefit here. `auth.routes.ts` stays as the one exception (separate shell).

### 3.4 Mandatory vs optional parts

| Part | Status |
|---|---|
| `model/`, `repository/` (contract + api + mock), `service/`, `pages/<features>-list/`, `utils/<feature>-query.ts` | **Mandatory** for every CRUD module |
| `components/<feature>-form/` | Mandatory *when* create/edit happens in a drawer |
| `pages/<feature>-form/` | Instead of the drawer form, *when* the form is too large for a drawer (§4.B) |
| `components/<feature>-card/` | Only for card-grid lists |
| `pages/<feature>-details/` | Only when users need a read-only view beyond the list (Branches, Roles today); **do not** add empty ones |
| `utils/*-labels`, `*-summary`, `*-form-data`, `*-status`, `*-dates` | Only when needed |
| `<features>.qa.spec.ts`, `.integration.spec.ts` | Optional |

No empty folders and no placeholder files to make modules "look" identical.

---

## 4. Canonical logic flow

### 4.0 Who owns what

| Concern | Owner |
|---|---|
| Shape of a request/response | model + repository contract |
| HTTP details, param names, multipart | api repository (+ `buildXParams`, `*-form-data`) |
| Business rules | **backend**; the mock merely mirrors them |
| List query, results, loading, error, saving, stale guard | feature service |
| Success toast, `status:false` → failure, reload after mutation | feature service |
| Failure toast (400/403/404/409, network) | `error.interceptor` |
| Permission flags, drawer/dialog state, navigation, selection | page |
| Field validation, normalisation, payload shape, preventing double submit | form component |

### 4.A Loading a list

1. Page `ngOnInit` resets the widgets' filters (the service outlives the page, the inputs start empty) and calls `load()` (or `initialize()` for branch-scoped lists). [S]
2. `load()`: `requestId++`, `inFlight?.unsubscribe()`, `loading=true`, `hasError=false`, call repository with the current query. [S]
3. Only the latest response may write `items`/`meta` or clear `loading` (id check in `finalize`). [S]
4. Failure → `hasError=true`, **previous rows kept**; page shows `FailedState` with a retry bound to `reload()`. [S]
5. Query is a signal; filters go through `setFilters(partial)` which **always resets to page 1**; `setPage(n)` does not clamp (the pager owns the bound). [S]
6. Search: the page ignores emissions that change nothing (`(term||undefined) === query().search`) so no pointless reload and no selection reset. [S in chairs, branches, offers, packages, services; **missing in barbers, users, roles** — BA-06]
7. Skeleton only while `loading && rows.length === 0`; empty state distinguishes "no matches" (`isFiltered`) from "none yet". [S]
8. Param names: camelCase (`pageNumber`, `pageSize`, `search`, `isActive`, `branchId`). Unset filters are omitted; `0` and `false` are **real** filters (`!== undefined`). [S for 6 modules; users/roles PascalCase pending contract check — D3]
9. Page size: one named constant per view type (card grid / table), not a per-module magic number. [P — D2]

### 4.B Creating an item

| Step | Drawer form (default) [S: chairs, packages, offers, barbers, users, roles] | Full-page form [S: branches, services] |
|---|---|---|
| Open | `openCreate()` bumps `drawerToken`, sets mode, opens | Route `/main/<features>/new` guarded by `<Feature>.Create` |
| Initial state | Form gets defaults via `input`s (e.g. pre-selected branch) | Form built by a `*.factory` util |
| Validation | Required / max-length / format in the form; **trim first, then validate length** [P — BA-02/CH-01] | Same, via `*.validators` |
| Submit | `submit()` starts with `if (saving()) return;` then `markAllAsTouched()` if invalid [S in 5 forms; **P** for barbers/users/roles] | Same |
| Call | Page → `service.create<X>(payload)` | Page → same |
| Duplicate prevention | `saving` input disables the button (`[loading]`) **and** `submit()` guard | Same |
| Response | Service `mutate()`: `!res.status` → failure; success → i18n toast; returns `id | null` | Same; page navigates to the details/list |
| After success | Service reloads list (drawer modules) — page closes drawer | List page reloads itself on entry (branches), so the service need not |
| Failure | Interceptor toast; **drawer stays open**, form keeps its values | Same |

**Rule for drawer vs page [P, codifies existing practice]:** drawer when the form is flat and short (roughly ≤ 6 fields, no nested lists); full page when it has nested or repeating data (branch working hours, service prices per branch).

### 4.C Editing an item

1. `openEdit(row)` first line: `if (!canEdit()) return;` [S in 6 pages].
2. Take `token = ++drawerToken`; open the drawer with `drawerLoading=true`; call `service.get<X>(id)`.
3. In the callback: `if (token !== drawerToken) return;` (closed or replaced meanwhile). [S in barbers, chairs, packages, offers (the four drawer modules that load details); **missing in users** — N3]
4. `null` result → close the drawer (the interceptor already explained why).
5. Form populates in `ngOnInit` from the `details` input; immutable fields are `disable()`d (chair's branch) so they never block validation. [S]
6. **Late inputs** (options arriving after the form opened): pre-selection must re-run when options arrive, and must not overwrite something the user already chose. [P — CH-02]
7. Submit → `service.update<X>(id, payload)` → boolean. Success toast + list reload by the service; page closes the drawer.

### 4.D Deleting an item

1. Button visibility: permission flag in the template. **Handler check too:** `askDelete()` and `confirmDelete()` start with `if (!canDelete()) return;` [P — M3].
2. Confirmation: `ConfirmModalComponent` with the item's localized name (or a count for bulk). [S]
3. `confirmDelete()` ignores clicks while `saving()` [P]; calls `service.remove(ids)`.
4. Service: body `{ ids }`, `status:false` → failure, success toast, then `reloadAfterRemoval(n)` — steps back one page if the delete emptied the current one. [S]
5. Page closes the dialog **only on success**; tables also clear selection **only for the deleted ids** [P — BA-07].
6. Self-protection (cannot delete/deactivate yourself or your own role) is a page-level `lockedIds` [S in users/roles].

### 4.E Module-specific operations

| Operation | Where it lives | Example |
|---|---|---|
| Activate / deactivate | `service.toggleStatus(id)` → reload (counts may change); page has `if (saving()) return;` and a permission check | Chairs, Branches, Offers (Stop/Resume uses a state-dependent toast key) |
| Bulk actions | Service method per action, page owns selection and the dialog/drawer | Services (copy/adjust prices, bulk status) |
| Details | Dedicated page; `service.get<X>(id)` returning `null` → `FailedState` | Branches, Roles |
| Nested data | Own repository methods + service method; the owning page composes | Roles permissions (`savePermissions`) |
| Option lists for dropdowns | `service.loadOptions()` on the **owning** feature's service, independent of list state, capped at the API max page size | `BranchesService.loadOptions()`, `RolesService.loadOptions()` |

---

## 5. Cross-module standards

### 5.1 Dependency injection  — **the most important change**

**Standard [P, extends S]:**

1. **Every** repository is an `InjectionToken` with an interface. Services only ever `inject(X_REPOSITORY)`. Applies to **all** modules, including users, roles, dashboard, profile and **auth** (auth currently injects both implementations).
2. Provider wiring lives in **one place**: a `data-providers` file next to `app.config.ts` (e.g. `app.providers.ts` exporting `DATA_PROVIDERS`), imported by `app.config.ts`. No module chooses between mock and API itself.
3. **Production must not contain the mock classes at all.** Because N1 proves a ternary on `environment.useMock` is not tree-shaken, the choice has to happen at build time. The project already uses `fileReplacements` for `environment.ts`; the same mechanism should swap `app.providers.ts` → `app.providers.prod.ts` (API repositories only; **no import of any `*-mock.repository` or `core/mock/*`**). `environment.useMock` stays only for the development/mock configuration.
4. **Verification step for the later implementation:** after a production build, `grep` of `dist/` must find none of `Nasr City`, `Chair not found`, `Offer not found`, `startsWith("manager")`. This can be a script, so it cannot silently regress.
5. **Tests** override a repository with `{ provide: X_REPOSITORY, useValue: stub }` [S: offers/barbers/services specs already do this]. Services that are `providedIn: 'root'` need no other wiring.

6. **N14 constraint:** Angular does not merge `fileReplacements` across combined configurations (proven by the `build:template-brand` result). A provider-file swap added the same way would be silently dropped in the same situation. So the later implementation must make every buildable configuration list **all** the replacements it needs (for example a dedicated `production-brand-template` configuration that contains both the environment/provider swap and the brand swap), and the mock-leak check in item 4 must run against **every** production-like script, not only the default build.

Alternatives considered (details in `step-02-decisions-required.md`, D4): runtime lazy `import()` of the mock providers; leaving mocks in production behind the flag.

### 5.2 Models and API contracts

- File `<feature>.model.ts`. Names: `<Name>ListItem`, `<Name>Details`, `Create<Name>Payload`, `Update<Name>Payload`, `Delete<Names>Request`, `<Names>Query`. [S: chairs, offers, barbers, packages, services. Users use `CreateUserRequest` / `UpdateUserRequest` — alignment is cosmetic; D5]
- Repository methods: `get<Plural>(query)`, `get<Singular>ById(id)`, `create<Singular>`, `update<Singular>`, `toggle<Singular>Status`, `delete<Plural>`. Users/roles/dashboard use shorter names (`getUser`, `toggleStatus`) — rename only when those modules are touched for DI.
- Every method returns `Observable<ApiResponse<T>>`. `ApiResponse.data` is `T | null`; services handle null (`res.data ?? []`). [S]
- `meta.additionalData` carries server-side counts (tabs, summary cards); read it **only** through a `read<X>Summary(meta)` util. [S]
- Query params camelCase; DELETE bulk body `{ ids }`; multipart builders live in `utils/*-form-data.ts` and are unit-tested. [S]

### 5.3 Services and state

- Private writable signals `_x`, public `asReadonly()`. Names: `items` (plural of the entity), `meta`, `query`, `loading`, `saving`, `hasError`. [S]
- `providedIn: 'root'` singletons, because list state survives navigation (pages reset widgets in `ngOnInit`). [S]
- **Concurrent mutations [P — M2]:** replace `saving: boolean` with an in-flight counter: `private inFlight = signal(0)`, `readonly saving = computed(() => inFlight() > 0)`, `+1` on subscribe, `-1` in `finalize`. This fixes the "first finisher clears the flag" bug (BA-04/CH-03/BR-04) in all nine services with one identical change. The `saving()` guard on handlers stays, so the counter mostly matters for the bulk and parallel paths.
- Mutation pipeline stays the shared shape: `status:false` → throw → `catchError(() => of(null))` → success toast → `finalize`. Move `mutate()` into a tiny shared helper only if the roadmap's Step 04 finds it identical in ≥ 6 services (it is nearly identical in 6 today; offers differs by taking a key function). Not before.
- Success toasts use our own i18n keys (the backend message is English-only). Failures are never toasted by the service. [S]
- Users/roles must gain: `requestId` guard, `status:false` handling, `inFlight` counter. [S for the first two in the other 6]

### 5.4 Components

- Standalone, `ChangeDetectionStrategy.OnPush`, `input()`/`output()`/`computed()`, `protected` template members, `inject()` only. [S, 100 % today]
- Permission flags are `computed(() => auth.hasPermission(PERMISSIONS.X.Y))` (lazy). Keep as is until N11 is understood.
- Pages are thin: no HTTP params, no payload building, no business rules.
- Cards and forms are presentational. Cross-feature UI reused by 2+ features moves to `shared/` [P — N8, D9].
- Hard-coded hex colours: tokens only (5 exceptions today).

### 5.5 Forms

- `FormBuilder.nonNullable`, typed controls. Error message = a function returning an **i18n key** (`error(name)`), shown after `touched`. [S]
- A shared `notBlank` validator (and trim helper) in `shared/validators/` replaces the four copies. [P — N7]
- **Validate length on the trimmed value.** [P — BA-02/CH-01/N6]
- `submit()`: `if (saving()) return;` → `if (invalid) { markAllAsTouched(); return; }` → normalise (`trim`, `Number()`, empty → `undefined/null` per contract) → `emit`. [S in 5 forms; P for 3]
- One form for create + edit through a `mode` input; locked fields are `disable()`d and read with `getRawValue()`. [S]
- Late inputs: re-evaluate pre-selection when `branches()` changes, only if the control is untouched/empty. [P — CH-02]
- Initial values are set in `ngOnInit` from inputs, never via `queueMicrotask`. [P — N6]

### 5.6 Permissions

| Layer | Rule |
|---|---|
| Route | `permissionGuard` with `data.permission` on every non-dashboard route, including `…/new` and `…/:id/edit` [S] |
| UI | `@if (canX())` with computed flags — pick **one** style; `*appCan` is used twice [P — D6] |
| Handler | Every mutating handler (`openCreate`, `openEdit`, `toggle`, `askDelete`, `confirmDelete`, bulk tools) starts with its permission check [P — M3]. Navigation-based pages (Branches edit/new) rely on the route guard |
| Service | No permission logic (UI concern); the backend is authoritative |

### 5.7 Testing

| Layer | What the spec proves | Tier |
|---|---|---|
| `buildXParams` util | camelCase names, omitted unset filters, `0`/`false` sent | **1 — mandatory** |
| API repository | URL, verb, params, body (with `HttpTestingController`) | **1** |
| Service | Stale guard, `status:false`, toasts, reload, `reloadAfterRemoval`, in-flight counter; repository stubbed through the token | **1** |
| Form | Required/format/length (incl. trim), `saving` guard, payload normalisation, create vs edit, late inputs | **1** |
| Wiring | Route + permission + breadcrumb + sidebar item | **1** (cheap) |
| Mock repository | Mirrors API rules (409/404…) | 2 |
| List page | Permission-gated buttons, handler checks, empty/error/skeleton, drawer token, confirm flows | 2 |
| Card / details | Inputs/outputs, gated actions | 2 |
| `qa` / `integration` | Known-defect pins (`it.fails`), cross-module flows | optional |

Today, **users and roles have no Tier-1 coverage beyond one util spec each; Services and Packages have lighter suites than Chairs and Offers (no api-repository spec).** Whether the standard should require parity retroactively is a decision (D10). Tests for `auth.service`, both guards and `token.interceptor` (M6) should be written **after** the DI change so they are not rewritten.

### 5.8 UI / UX

- **Loading:** skeleton cards/rows only on first load; reloads keep content in place. [S]
- **Empty:** two messages — none yet vs no matches. [S]
- **Error:** `FailedState` with retry; keep stale rows. [S]
- **Success:** toast with localized message from the service. [S]
- **Destructive actions:** `ConfirmModalComponent`, never a bare click. [S]
- **Drawer:** stays open on failure; closes on success only. [S]
- **Responsive/RTL:** tokens + logical properties; EN/AR keys must exist in both files. [S]
- **Accessibility (optional pattern):** Offers has a polite live-region announcement after each load and focus recovery after a card disappears. Valuable, but module-specific code today; promoting it is D11.
- **Unsaved changes:** no `canDeactivate` exists anywhere (only the profile page tracks `dirty`). Relevant for the two full-page forms — D16.

---

## 6. Mandatory vs optional vs approved exceptions

### 6.1 Mandatory (every CRUD module)

1. Token DI + one provider file; **no mock code in the production build**
2. Repository contract returns `Observable<ApiResponse<T>>`; api and mock implement it
3. `buildXParams` util with spec; camelCase unless a documented contract says otherwise
4. Service with `requestId` stale guard, `status:false` as failure, in-flight counter, i18n success toast
5. Standalone + OnPush components; `inject()`, `input()`, `output()`
6. List page: reset widgets on entry, no-op search guard, skeleton/empty/failed states, delete confirmation
7. Route guard on every route; **handler-level permission check** on every mutating handler
8. Forms: `saving` guard, trimmed validation, i18n-key errors, create/edit reuse
9. One folder per component with external template/styles
10. Tier-1 tests (§5.7)

### 6.2 Optional patterns (only when the module needs them)

`initialize()` + branch selector · status tabs with counts · summary cards · details page · full-page form + factory/mapper/validators · multipart `*-form-data` · bulk tools · selection + `lockedIds` · live-region announcement · `qa`/`integration` specs.

### 6.3 Approved exceptions

| Exception | Allowed when | Why | Must stay consistent |
|---|---|---|---|
| `auth` module (6 pages, `auth.routes.ts`, no list, no service-level list state) | Always | Different shell and purpose | Token DI, handler-level safety, tests (currently missing — M6) |
| `dashboard` (read-only, no `utils/`, no mutations) | Always | No CRUD | Token DI, `status:false` handling, error/empty states |
| `profile-management` (single page, form inside the page) | Always | Single record, not a list | Token DI, form rules, `saving` guard |
| `no-access`, `not-found` (single file at module root, no `pages/`) | Always | Static pages | Standalone + OnPush |
| `design-system` | Dev-only | Reference page | Excluded from production routes (already via `showDesignSystem`) |
| Full-page form (branches, services) | Form has nested/repeating data | Doesn't fit a drawer | Same form rules, same service contract |
| `initialize()` + branch selector (packages, services, offers) | API lists one branch at a time | Needs the branch list first | Same `load()` guard and mutation contract |
| `services` module name → `services/service/services.service.ts` | Always | Layer folder is `service/`; module is `services` | Documented, not renamed |
| Roles `rename`, `savePermissions`; Offers `toggleStatus` toast key | Domain-specific verbs | They are the domain language | Return type stays `boolean` |
| Create/update that **don't** reload the list (branches) | Caller navigates away and the list reloads on entry | Avoids a wasted request | Documented on the method |
| Page size other than the standard | Documented in the model/service with a reason | e.g. Services' 20 if confirmed | Still one named constant |
| Per-sibling shared stylesheet (`bulk-form.scss`) | 2+ siblings share layout | Avoids duplication | Underscore naming if only `@use`d |

---

## 7. What is new vs what already exists

| Item | Status |
|---|---|
| Token DI, `requestId` guard, `status:false` handling, `drawerToken`, no-op search guard, `reloadAfterRemoval`, `lockedIds`, `buildXParams`, wiring specs, i18n-key errors, one folder per card | **[S]** already in the code |
| Provider-file swap to remove mocks from production | **[P]** (needed because of N1) |
| In-flight counter instead of `saving` boolean | **[P]** |
| Handler-level permission checks on toggle/delete/create | **[P]** (partially present: `openEdit`) |
| Trim-before-length validation; shared `notBlank`; late-input preselection | **[P]** |
| One folder per form component; `role-form` external template/styles | **[P]** (convention exists for cards) |
| Page-size constants per view type; Tier-1 test requirement | **[P]** |
| Prettier / `.editorconfig` / ESLint import rule | **[P]** (decisions D7) |

I have **not** invented any convention that contradicts the code; each **[P]** is either the extension of an existing pattern to the modules that lack it, or a fix for a defect already documented in Step 01.
