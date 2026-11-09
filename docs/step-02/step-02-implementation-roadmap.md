# Step 02 — Implementation Roadmap

Companion to `step-02-architecture-standard.md`. **Proposal only — nothing is implemented.** Step 03 starts only after you approve the standard and answer `step-02-decisions-required.md`.

Step numbering follows what Step 01 used: **03 structure alignment · 04 logic-flow alignment · 05 functional / UI / UX testing · 06 fixes and hardening.**

---

## 1. Per-step safety protocol (proposed)

The ZIP you gave me has no `.git` directory, so "diff against the previous step" has to be explicit. For each later step I would:

1. Record a SHA-256 manifest of the incoming project (I did this for Step 02: 410 files).
2. Run `ng build` (production) and the full test suite **before** and **after**; report both.
3. After the change, produce the list of added / changed / removed files from the manifest and report it.
4. From Step 04 on, run the **mock-leak check** after **every** production-like build (`npm run build` **and** `npm run build:template-brand`): `dist/` must not contain `Nasr City`, `Chair not found`, `Offer not found`, `startsWith("manager")`, and must contain `useMock:!1` (never `useMock:!0`).
5. Return the ZIP with the same packaging convention (no `node_modules`, `dist`, `.angular`, caches) and stop for approval.

---

## 2. Ordered plan

Priority: **P0** security/reliability · **P1** standard-defining · **P2** consistency · **P3** nice to have. Risk is the chance of breaking behaviour while making the change.

### Step 03 — Structure alignment (moves, naming, tooling; **no behaviour change**)

| ID | Change | Affected modules | Files / layers | Reason | Priority | Risk | Depends on | Step 01 ref |
|---|---|---|---|---|---|---|---|---|
| R-02 | Add `.editorconfig` + Prettier config; normalise the 2 CRLF files to LF (Step 01's "50" was wrong); apply the chosen quote style | all | config files + mass reformat of `src/` | Makes every later diff reviewable; removes C1/S7 noise. Do it **first and alone** because it touches every file | P2 | Low (mechanical), **large diff** | D7 | I3, C1, C3, S7 |
| R-04 | One folder per form component (`<x>-form/` with `.ts/.html/.scss/.spec.ts`); update imports and `styleUrl` | chairs, offers, packages, barbers, users | `components/*-form.*`, importing pages/specs | S1: cards are in folders, forms aren't; one rule for all components | P2 | Low (moves + import updates; build and specs catch mistakes) | R-02; D8 | I1, S1 |
| R-06 | Give `role-form` external `.html` / `.scss` (move into `role-form/`) | roles | `components/role-form.ts` | S2: only feature component with inline template | P2 | Low | R-04 | I2, S2 |
| R-13 | Decide where `service-picker` lives (promote to `shared/components/` or document as a cross-feature component) | services, offers, packages | `services/components/service-picker/*` + 2 importers | N8 | P3 | Low | D9 | — (new) |
| R-18 | Remove dead code (`ExcelExportService`, `PrintExportService`, `FeaturePlaceholder`, unused `shared/components/index.ts`, the `exceljs` / `file-saver` / `@types/file-saver` dependencies) | core, shared, `package.json` | 4 files + `package.json` / lock | Q6; also clears the `uuid` advisory | P3 | Low, but **changes dependencies** | **D1 must say export is not planned** | I6, Q6 |
| R-20 | Update `README.md` structure section (it says structure is uniform) and record approved exceptions | docs | `README.md` | I7; README currently contradicts §2 of Step 01 | P2 | None | approval of the standard | I7 |
| R-03 | ESLint with `no-restricted-imports` (deep relative `shared/core` paths → aliases) and `lint` script; migrate the 191 relative imports | all | `package.json` (new devDependencies), eslint config, many import lines | C2/C3; stops the standard eroding | P2 | Low–Med (new dev dependencies) | R-02; D7 | I4, C2, C3 |

### Step 04 — Logic-flow alignment (behaviour changes, each covered by specs)

| ID | Change | Affected modules | Files / layers | Reason | Priority | Risk | Depends on | Step 01 ref |
|---|---|---|---|---|---|---|---|---|
| **R-01** | **Token DI for every repository + build-time provider swap so production contains no mock code** (`app.providers.ts` / `app.providers.prod.ts`, `fileReplacements` entry, auth/users/roles/dashboard/profile services) **and fix the `build:template-brand` configuration so it also gets the production replacements (N14)** | users, roles, dashboard, profile, auth, `app.config.ts`, `angular.json` | 5 services, 5 repository token files, new providers files, `angular.json` (configurations) | A1/Q5, **N1** (token ternary alone does not remove mocks), **N14** (template-brand build is mock-enabled) | **P0** | Med (config + 5 services; the existing 1128 tests cover most call sites) | D4 | M1, A1, Q5 |
| R-05 | `requestId` + `unsubscribe` stale guard and `status:false` handling in Users and Roles services | users, roles | 2 services (+ `getUser`/`getRole` status check) | L1, L2 | P0 | Low | R-01 (same files) | M4, L1, L2 |
| R-07 | In-flight counter replacing the `saving` boolean (`saving = computed(inFlight() > 0)`), including the Services bulk path (4 `set`s) | all 9 mutating services | 9 services | L4; fixes BA-04, CH-03, BR-04 | P0 | Low (identical change; `qa` specs flip from `it.fails` to passing) | — | M2, L4 |
| R-08 | Permission check as first line of every mutating handler (`toggle`, `askDelete`, `confirmDelete`, `openCreate`, bulk tools, `openRename`); `saving()` guard on `toggle` in barbers/users | 8 list pages | 8 `*-list.ts` | L5; fixes BA-05, CH-04 | P0 | Low | — | M3, L5 |
| R-10 | Form standard: shared `notBlank` + trim helper in `shared/validators/`; validate length after trim; `saving` guard in barbers/users/roles; seed role-form in `ngOnInit`; late-input preselect (CH-02) | 8 forms + 2 form pages | forms, `shared/validators/` | N4, N6, N7; fixes BA-01, BA-02, CH-01, CH-02 | P1 | Low–Med (touches validation behaviour) | R-04 (forms already moved) | M7 (part), BA-01/02, CH-01/02 |
| R-11 | List-page alignment: no-op search guard in barbers/users/roles; selection cleared only for deleted ids; `drawerToken` in users; remove the 6 non-null assertions in pages/forms | barbers, users, roles, (+ role-details, adjust-prices-form) | 3 list pages + 2 | N2, N3; fixes BA-06, BA-07 | P1 | Low | R-08 | M7 (part), BA-06/07 |
| R-09 | Named page-size constants per view type (card grid / table) in one shared place | all | `shared/` const + 9 services | A3 | P2 | Low | D2 | I8, A3 |
| R-16 | Align mutation / request names (`create`→`createUser`, `CreateUserRequest`→`CreateUserPayload`, repository method names) | users, roles, dashboard | services, models, repos, their specs | L3 | P3 | Low–Med (renames) | R-01, D5 | I5, L3 |
| R-15 | **CANCELLED — D3 resolved as A (PascalCase confirmed against the real API).** Query-param casing: keep PascalCase **or** switch users/roles to camelCase, per the contract | users, roles | `user-query.ts`, `role-query.ts` (+ specs) | A2 / N13 | P2 | Med (API contract) | **D3** | I5, A2 |
| R-12 | Normalise route strings in `router.navigate` (`"main/branches/new"` vs `"/main/services"`) | branches (and any relative-string navigations) | `branches-list.ts` etc. | Cosmetic consistency | P3 | Low | — | — (new) |

### Step 05 — Functional / UI / UX testing

No standard-driven source change. Manual checklist plus the tooling decision (D10 / Q9): there is no E2E or axe tooling. Scope: every list (empty / filtered / error / loading), every drawer and full-page form (create, edit, validation, duplicate submit, permission variants for SuperAdmin and BranchManager), delete flows, toggles, EN/AR + RTL, responsive widths. Findings go to Step 06. *I cannot do browser testing in this environment; this step needs a real browser or an approved tool.*

### Step 06 — Fixes and hardening

| ID | Change | Affected modules | Reason | Priority | Risk | Depends on | Step 01 ref |
|---|---|---|---|---|---|---|---|
| R-14 | Tier-1 tests for the modules that lack them: api-repo specs (packages, services, users, roles), mock-repo specs (services, users, roles), service/form/list specs (users, roles) | packages, services, users, roles | Q2 | P1 | None (tests only) | R-05, R-07, R-10 (so tests target the final behaviour) | O1, Q2 |
| R-17 | Tests for `auth.service`, `auth.guard`, `permission.guard`, `token.interceptor`, the 6 auth pages, layout; more for `error.interceptor` | auth, core, layout | Q1 (highest-risk untested code) | P0 | None | **R-01** (auth DI changes; avoid writing tests twice) | M6, Q1 |
| R-19 | Patch `@angular/*` 21.2.17 → 21.2.26 (same `^21.0.0` range) | deps | §6.3 advisories | P1 | Low (run build + suite) | R-18 (clears `uuid`); D14 | M5, §6.3 |
| R-21 | Remaining confirmed defects: BR-02 (null map link), CH-05 and XM-01 (mock vs API), BR-03 once decided | branches, chairs, mocks | §6.1 | P2 | Low | D13 | M7, BR-02/03, CH-05, XM-01 |
| R-22 | Fix the 3 missing i18n keys; review the 9 apparently unused keys | shared, layout, i18n | Q7 | P3 | Low | — | I6, Q7 |
| R-23 | Replace the 5 hard-coded hex colours with tokens | SCSS | C5 | P3 | Low | — | C5 |
| R-24 | Optional `*.qa.spec.ts` suites for packages, offers, services, users, roles | those | O1 (unknown defect lists) | P3 | None | R-14 | O1 |
| R-25 | De-denormalise the mock DB (only if mocks stay in dev) | `core/mock/mock-db.ts` + mocks | Q8, XM-02 | P3 | Med | D4 | O4, Q8, XM-02 |

**Suggested order inside Step 04:** R-01 → R-05 → R-07 → R-08 → R-10 → R-11 → R-09 → R-15/R-16 (if approved). R-01 first because R-05 touches the same two services and R-17 depends on it.

---

## 3. Disposition of every Step 01 finding

Dispositions: **Included** = captured in the proposed standard · **Planned** = scheduled implementation · **Decision** = needs your call first · **Not recommended** = reason given. No finding is dropped silently.

### 3.1 Structural (S) and architecture (A)

| Finding | Disposition | Where | Note |
|---|---|---|---|
| S1 card in folder, form loose | Included + Planned | Standard §3.3; **R-04** (Step 03) | |
| S2 inline `role-form` | Included + Planned | **R-06** | |
| S3 `services.service.ts` name | **Not recommended** to rename | Standard §6.3 | Layer folder `service/` + feature `services` is consistent; renaming gains nothing and touches imports and specs. Documented as an exception |
| S4 half-organised `services/components` | **Downgraded** — largely intentional (N12) | Standard §3.3, §6.3 | `bulk-form.scss` is a shared sibling stylesheet; optional rename to `_bulk-form.scss` |
| S5 dashboard/error pages differ | Included | Standard §6.3 | Documented exceptions |
| S6 class/file suffix naming | **Not recommended** (mass rename). Included as a two-tier convention | Standard §3.3 | Optional: the 4 shared files without `.component` (D8) |
| S7 CRLF / no `.editorconfig` | Planned (needs decision) | **R-02**, D7 | |
| A1 two DI patterns | Included + Planned (**corrected/extended by N1**) | Standard §5.1; **R-01** | |
| A2 query casing | **Decision** | D3; R-15 | Evidence suggests PascalCase is deliberate (N13) |
| A3 page sizes | **Decision** | D2; R-09 | Pattern emerges: cards 12, tables 10; Services 20 is the outlier |
| A4 repository consistency (positive) | Included | Standard §1, §5.2 | Keep |

### 3.2 Logic (L), coding standards (C)

| Finding | Disposition | Where |
|---|---|---|
| L1 no stale guard (users/roles) | Planned | R-05 (Step 04) |
| L2 `status:false` unhandled (users/roles) | Planned | R-05 |
| L3 mutation naming | Included + **Decision** | Standard §5.2; D5; R-16 |
| L4 `saving` boolean | Included + Planned | Standard §5.3; R-07 |
| L5 handler permission checks | Included + Planned (nuance: `openEdit` already checks) | Standard §5.6; R-08 |
| L6 `initialize()` only in 3 modules | Included as optional pattern | Standard §6.2 |
| C1 quote styles | **Decision** | D7; R-02 |
| C2 import path style | Planned (needs decision on tooling) | R-03, D7 |
| C3 no linting | Planned (needs decision) | R-02, R-03, D7 |
| C4 `subscribe` vs `takeUntilDestroyed` | Included as a rule (one-shot HTTP is fine; long-lived streams must be torn down). **Not recommended** to convert all 86 calls blindly | Standard §5.4; audit in Step 05/06 |
| C5 hard-coded hex | Planned | R-23 |
| C6 hard-coded text (dev page only) | Not recommended (dev-only page, no product impact) | — |
| **Step 01 claim "0 non-null assertions" (wrong)** | **Corrected** → N2 | R-11 |

### 3.3 Defects (§6.1) and risks (§6.2, 6.3, 6.4)

| Finding | Disposition | Where |
|---|---|---|
| BA-01 double submit (barbers form) | Included + Planned | Standard §5.5; R-10 (Step 04) |
| BA-02 / CH-01 length before trim | Included + Planned (now known to affect **all** forms by reading, N6) | R-10 |
| BA-04 / CH-03 / BR-04 `saving` early clear | Planned | R-07 |
| BA-05 / CH-04 handler permission | Planned | R-08 |
| BA-06 search no-op reload | Included + Planned | R-11 |
| BA-07 delete clears all ticks | Included + Planned | R-11 |
| CH-02 late branch preselect | Included + Planned | R-10 |
| CH-05 mock accepts out-of-range type | Planned (mock fidelity) | R-21 |
| BR-02 null map link (latent) | Planned | R-21 |
| BR-03 same-time hours rule | **Decision (product)** | D13 |
| XM-01, XM-02 mock ≠ API | Planned/Decision | R-21, R-25, D4 |
| Q1 untested security code | Planned | R-17 (after R-01) |
| Q2 thin tests on early modules | Included (tier standard) + Planned | Standard §5.7; R-14; D10 |
| Q3 tokens in `localStorage` | **Decision**, out of architecture scope; needs backend | D15 |
| Q4 module-level singleton in `error.interceptor` | Not recommended now; revisit while writing interceptor tests (R-17) | — |
| Q5 mock + permissive login in prod | Planned — **P0** | R-01 |
| Q6 dead code | Planned, **Decision** | D1; R-18 |
| Q7 i18n (3 missing, 9 unused keys) | Planned | R-22 |
| Q8 mock denormalisation | Decision | D4; R-25 |
| Q9 no E2E / a11y tooling | Decision | D10; Step 05 |
| §6.3 `@angular/*` advisories | Planned (**changes dependencies**, so approval needed) | R-19, D14 |
| §6.3 `exceljs → uuid` | Planned with Q6 | R-18 |
| §6.3 `brace-expansion` (dev tooling, transitive) | Not recommended to act separately; re-check after R-19 | — |
| §6.4 README claims uniform structure | Planned | R-20 |

### 3.4 Recommendations M1–M7, I1–I8, O1–O5

| Rec | Disposition | Step / ID | Comment |
|---|---|---|---|
| **M1** unify DI, keep mocks out of prod | Included + Planned — **scope widened** | Step 04 / R-01 | Tokens alone are not enough (N1); needs the build-time swap (D4) |
| M2 in-flight counter | Planned | Step 04 / R-07 | |
| M3 handler permission checks | Planned | Step 04 / R-08 | |
| M4 stale guard + `status:false` for users/roles | Planned | Step 04 / R-05 | |
| M5 Angular patch | Planned, needs approval | Step 06 / R-19 | May be pulled forward (D14) |
| M6 tests for auth/guards/interceptor | Planned | Step 06 / R-17 | After R-01 |
| M7 BA-01, CH-02, BA-06, BA-07 | Planned — **proposed split** | BA-01/CH-02 → R-10, BA-06/07 → R-11 (both Step 04) | They are rules of the standard, so I suggest Step 04, not 06 (D14) |
| I1 folder per component | Included + Planned | Step 03 / R-04 | |
| I2 `role-form` external files | Planned | Step 03 / R-06 | |
| I3 Prettier/.editorconfig/CRLF | Planned, needs decision | Step 03 / R-02 | D7 |
| I4 ESLint import rule | Planned, needs decision | Step 03 / R-03 | D7 |
| I5 naming + casing | Decision | R-15, R-16 | D3, D5 |
| I6 dead code | Planned, **needs your answer on export** | R-18 | D1 |
| I7 document exceptions | Included | Standard §6.3; R-20 | |
| I8 page-size policy | Decision | R-09 | D2 |
| O1 QA suites for the other modules | Planned optional | R-24 | |
| O2 browser automation + axe | Decision | D10 | |
| O3 token storage | Decision, backend-dependent | D15 | |
| O4 de-denormalise mock DB | Decision | R-25, D4 | Only worth it if mocks stay |
| O5 BR-03 | Decision (product) | D13 | |

### 3.5 New findings from Step 02

| ID | Disposition |
|---|---|
| N1 token ternary still bundles mocks | Included in standard §5.1; part of R-01 |
| N2 non-null assertions | R-11 |
| N3 users `drawerToken` | R-11 |
| N4 form `saving` guards | R-10 |
| N5 `toggle` `saving` guard | R-08 |
| N6 role-form blank name, `queueMicrotask`; trim-before-validate in all forms | R-10 |
| N7 duplicated `notBlank` | R-10 |
| N8 `service-picker` location | D9; R-13 |
| N9 two permission-gating styles | D6 |
| N10 `ToggleStatus` only on Chair | D12 |
| N11 lazy `PERMISSIONS` reads | Keep as is; investigate root cause in Step 06 (not scheduled as a fix) |
| N12 S4 downgrade | Standard §6.3 |
| N13 A2 reframed | D3 |
| **N14** `build:template-brand` produces a mock-enabled build | **P0**, folded into R-01; **Decision D17** on whether to pull this config-only fix forward before Step 03/04 |
