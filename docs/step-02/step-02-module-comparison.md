# Step 02 — Module Comparison and Alignment

Companion to `step-02-architecture-standard.md`. Read-only analysis: **nothing here has been applied.**

Legend: ✅ follows the proposed standard · ⚠️ partly · ❌ does not · — not applicable. Evidence was read from source; test counts come from the file listing (spec files per layer), not from a re-run.

---

## 1. Matrix (required format)

| Module | Current Structure | Current Logic Flow | Main Differences | Proposed Alignment |
|---|---|---|---|---|
| **Chairs** *(primary reference)* | `model · repository(contract/api/mock) · service · pages/chairs-list · components/chair-card/ (folder) + chair-form.* (loose) · utils (query, labels, summary)`. 11 src + 9 spec files, plus `chairs.qa.spec`. | Token DI. Service: `load/setFilters/setPage`, `requestId` + `unsubscribe`, `status:false` → failure, `saving` boolean, `reloadAfterRemoval`. Page: drawer create/edit with `drawerToken`, filters, summary cards, confirm dialogs, `openEdit` checks `canEdit`, `toggle`/`confirmDelete` don't. Form: `saving` guard, locked branch, `notBlank` copy, length-before-trim. | Only module with a separate `ToggleStatus` permission. Pre-selected branch is lost if options arrive late (CH-02). | **Keep as the base.** Move `chair-form.*` into `chair-form/` (I1). Apply the four standard gaps: in-flight counter, handler permission checks, trim-then-length, shared `notBlank`. Fix late-preselect in the form. Keep everything else. |
| **Offers** *(secondary: branch-scoped)* | Same shape as Chairs + `offer-form.*` loose + 7 utils (dates, status, form-data, image, labels, query, summary). 15 src + 14 spec, `offers.wiring.spec`. | Token DI. Service adds `initialize/selectBranch/setTab/setSearch`, `mutate(request, () => key)`, tab counts from `meta.additionalData`. Page: drawer + `forkJoin` (details + service options), `drawerToken`, focus recovery, polite announcement. Multipart form. `saving` boolean. `toggle` checks only `saving()`. | Heaviest module; tabs; multipart banner; state-dependent toast key. | **Keep.** Loose form → folder. Apply the four standard gaps. Treat focus/announcement as an *optional pattern* (D11), do not copy into other modules by default. No structural rework. |
| **Packages** | Chairs-shaped; `package-form.*` loose; 3 utils. 11 src + 8 spec (incl. `packages.wiring.spec`). **No API-repository spec.** | Same as Offers minus tabs: `initialize/selectBranch`, token DI, `requestId`, `status:false`, `saving` boolean. `toggle` guarded by `saving()` only. | Lighter tests than Chairs/Offers; `notBlank` copy; same standard gaps. | Folder move for the form (I1). Four standard gaps. Add the missing API-repository spec when Tier-1 tests are scheduled (D10). Keep shared `service-picker` usage but see N8/D9. |
| **Branches** *(secondary: full-page form + details)* | `components/branch-card/ (folder)`, `pages/branches-list`, `pages/branches-form` (full page), `pages/branch-details`; 6 utils (factory, mapper, validators, hours, query). 14 src + 13 spec, `branches.qa.spec`. | Token DI. Service: `load/setFilters/setPage/loadOptions`, `requestId`, `status:false`; **create/update don't reload** (list reloads on entry); `saving` boolean. List page navigates (`router.navigate`); edit/new protected by route guard. Form page: `saving` guard, `failed` state. | Only module with its own details **and** form pages; uses `"main/branches/new"` (no leading slash) while services use `"/main/services"`. `toggleBranchStatus` has no permission check (route-guard only for edit/new). Hours rule BR-03 undecided. | Already structurally compliant (best folder discipline). Apply in-flight counter and the handler permission check on `toggle`/`delete`. Normalise navigation string style (cosmetic, with the list-page pass). BR-03 → product decision D13. |
| **Services** | `components/` has 4 folders + loose `bulk-form.scss` shared by 3 siblings; `pages/services-list`, `pages/services-form` (full page); 8 utils; `service/services.service.ts`. 20 src + 12 spec. **No API or mock repository specs.** | Token DI. Service: `initialize/selectBranch/setFilters/setPage` + `loadServiceOptions`, bulk (`setStatusForServices`, `copyPrices`, `adjustPrices`) with its **own** `_saving` set (4 places). Page: table + selection, `openEdit`/`openTool` check `canEdit`, `toggle` and `confirmDelete` don't. Page size **20**. | Only table with page size 20; `service-picker` is consumed by Offers/Packages; `services.service.ts` reads like a typo (S3). | Mostly compliant. Shared sibling stylesheet is **legitimate** (N12): document it, optionally rename `_bulk-form.scss`. In-flight counter must cover the bulk path (4 `set`s). Page size → D2. `service-picker` → shared or documented (D9). Add Tier-1 specs for API/mock repos (D10). Don't rename `services.service.ts`. |
| **Barbers** | Table list, `components/barber-form.*` loose, 6 utils (form-data, image, labels, phone, query, validators). 13 src + 14 spec, `barbers.qa/integration/wiring` specs. | Token DI, `requestId`, `status:false`. Page: selection + bulk delete, `drawerToken`, `openEdit` checks `canEdit`; `toggle` no `saving` guard; `onSearch` always reloads and clears selection (BA-06); delete clears all ticks (BA-07). Form: no `saving` guard (BA-01); length-before-trim (BA-02). | Multipart + phone/image utils are the best examples of those techniques. Page size 10 (documented in README). | Folder move for the form. Standard gaps + `saving` guard on form and `toggle`, no-op search guard, selection cleared only for deleted ids. Keep the utils as they are. |
| **Users** | Table list, `components/user-form.*` loose, `utils/user-query`. 8 src, **1 spec** (`user-query.spec`). | **Service-level DI switch** (`environment.useMock ? inject(Mock) : inject(Api)`). No `requestId` guard (L1). `mutate` ignores `status:false` (L2). `saving` boolean. `getUser` returns `res.data` without checking status. Params **PascalCase** (`PageNumber`, `Search`, `RoleId`, `Status`). Page: `openEdit` checks `canEdit`; **no `drawerToken`** (N3); `toggle` no guard; `editDetails()!` (N2). Form: no `saving` guard (N4). | Oldest pattern: differs on DI, stale guard, `status:false`, casing, page-size constant, method names (`create/update` vs `createX`), request type names (`CreateUserRequest`), single quotes. Good ideas: `lockedIds` (self-protection), selection reset on every query change, conditional password controls. | **Largest alignment.** Token DI + provider file (M1); add `requestId` + `status:false` (M4); in-flight counter; `drawerToken`; form `saving` guard; handler checks; no-op search guard; remove `!`. Casing only after the contract is confirmed (D3). Add Tier-1 tests (D10). Keep `lockedIds`, selection reset, password-controls logic. |
| **Roles** | List page + **details page** (permission matrix); `components/role-form.ts` with **inline template/styles** (no `.html/.scss`); `utils/permission-matrix` (+spec), `role-query`. 10 src, **1 spec**. | Same as Users (service-level DI switch, no stale guard, no `status:false`, boolean `saving`, PascalCase `PageNumber/PageSize/Search/IncludePermissions`), plus `rename`/`savePermissions` (refreshes the session if the role is yours). Form: `Validators.required` only (whitespace passes), no `saving` guard, `queueMicrotask` seeding (N6). | Inline form template (S2); depends on `AuthService`; `loadOptions()` consumed by Users. | Same alignment as Users + give `role-form` external `.html/.scss` (I2), `notBlank`, form guard, `ngOnInit` seeding. Keep `rename`/`savePermissions` names, `permission-matrix`, details page. Casing → D3. |

---

## 2. Non-CRUD modules (all documented as approved exceptions)

| Module | Current structure | What follows the standard | What differs | Proposed alignment |
|---|---|---|---|---|
| `auth` | 6 pages, `auth.routes.ts` at module root, repository (api + mock), `service/auth.service.ts` (467 lines), `_auth-shared.scss` | Standalone/OnPush, i18n keys | **Injects both** `AuthApiRepository` and `AuthMockRepository` and switches on `environment.useMock`; mock login accepts any email; **0 specs** | Token DI + provider swap (M1, highest priority); tests after DI (M6). Structure stays. |
| `dashboard` | 1 page, service, repository (api/mock), no `utils/` | Layering | Service-level DI switch; mock has no `throwError`; no specs | Token DI; no structural change. |
| `profile-management` | 1 page with form inside, `utils/profile-form-data` (spec) | Multipart util is tested | Service-level DI switch; mock has no `throwError`; 1 tiny spec; form is part of the page (`dirty` tracked) | Token DI; standard form rules (`saving` guard); no restructure. |
| `no-access`, `not-found` | Single file at module root | Standalone/OnPush | No `pages/` folder | Keep (documented exception). |
| `design-system` | 1 page, dev-only, excluded by `showDesignSystem` | — | Hard-coded UI text (acceptable, dev only) | Keep; verify it stays out of the production route list. |

---

## 3. Cross-cutting differences (one table, all eight CRUD modules)

| Aspect | Barbers | Branches | Chairs | Offers | Packages | Services | Users | Roles |
|---|---|---|---|---|---|---|---|---|
| View | table | cards | cards | cards+tabs | cards | table | table | table |
| Create/edit surface | drawer | **page** | drawer | drawer | drawer | **page** | drawer | drawer (name only) |
| Repository DI | token | token | token | token | token | token | **switch** | **switch** |
| Query casing | camel | camel | camel | camel | camel | camel | **Pascal** | **Pascal** |
| Page size | 10 | 12 | 12 | 12 | 12 | **20** | 10 | 10 |
| `requestId` stale guard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `status:false` = failure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `saving` | boolean | boolean | boolean | boolean | boolean | boolean (+bulk path) | boolean | boolean |
| Mutation names | `createBarber` | `createBranch` | `createChair` | `createOffer` | `createPackage` | `createService` | `create` | `create`, `rename` |
| Form `submit()` `saving` guard | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Trim before required/length check | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `drawerToken` | ✅ | — | ✅ | ✅ | ✅ | — | ❌ | — |
| No-op search guard | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `openEdit` checks permission | ✅ | route guard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (`openRename`) |
| `toggle` has permission check | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| `toggle` has `saving()` guard | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | — |
| `confirmDelete` has permission check | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Form in its own folder | ❌ | ✅ (page) | ❌ | ❌ | ❌ | ✅ (page) | ❌ | ❌ (inline) |
| Template style | external | external | external | external | external | external | external | **form inline** |
| Spec layers present (api / mock / service / list / form / card / details) | 1/1/1/1/1/–/– | 1/1/1/1/1/1/1 | 1/1/1/1/1/1/– | 1/1/1/1/1/1/– | **0**/1/1/1/1/1/– | **0/0**/1/1/3/–/– | **0/0/0/0/0** | **0/0/0/0/0** |
| Quote style | mixed | mostly double | mostly double | double | double | double | single | single |

Notes on the table: the "trim before required/length" row is **by reading the validators, not reproduced at runtime**. Branches (`branch-form.factory.ts`) and Services (`service-form.factory.ts`) use `Validators.required` + `Validators.maxLength` on the raw value, so a whitespace-only name passes `required` and a name that is valid after trimming can exceed the limit by a trailing space. Step 01 only pinned this for Barbers and Chairs (BA-02, CH-01).

---

## 4. Alignment checklist per module (what changes, what stays)

Each item references the roadmap IDs in `step-02-implementation-roadmap.md`. "Stay" lists things deliberately **not** changed.

| Module | Change in a later step | Stays as it is |
|---|---|---|
| Chairs | R-04 folder move · R-07 counter · R-08 handler checks · R-10 form (trim, `notBlank`, late preselect) | Service shape, drawer flow, filters, summary, `ToggleStatus` permission |
| Offers | R-04 · R-07 · R-08 · R-10 | `initialize`, tabs, `mutate(key fn)`, focus/announcement (optional pattern), multipart utils |
| Packages | R-04 · R-07 · R-08 · R-10 · R-14 (api spec) | `initialize`, drawer flow |
| Branches | R-07 · R-08 · R-12 (navigation string style) | Folder layout, factory/mapper/validators, details page, "no reload on create/update" |
| Services | R-07 (incl. bulk path) · R-08 · R-09 (page size, if decided) · R-13 (picker) · R-14 | Folder layout, shared `bulk-form.scss`, full-page form, `services.service.ts` name |
| Barbers | R-04 · R-07 · R-08 · R-10 (BA-01/02) · R-11 (BA-06/07) | Multipart/phone/image utils, selection model |
| Users | R-01 (DI) · R-05 (stale + `status:false`) · R-07 · R-08 · R-10 · R-11 · R-04 · R-15 (casing, after contract) · R-16 (naming) | `lockedIds`, password-controls, selection reset |
| Roles | R-01 · R-05 · R-06 (role-form external files) · R-07 · R-08 · R-10 · R-15 · R-16 | `rename`/`savePermissions`, permission matrix, details page |
| Auth / Dashboard / Profile | R-01 (DI); R-17 (auth tests) | Module shapes (approved exceptions) |

I deliberately recommend **no** changes that lack an architectural reason: no mass class rename (S6), no `services.service.ts` rename (S3), no per-feature route files, no unification of view type (table vs cards), no forced details pages.
