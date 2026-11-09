# Step 02 — Decisions Required

These are yours to make. I have **not** decided any of them. For each I give the evidence, the options, and what I would recommend, so you can answer quickly ("D1 A, D2 B, …"). Nothing is implemented until you answer.

Companion documents: `step-02-architecture-standard.md`, `step-02-module-comparison.md`, `step-02-implementation-roadmap.md`.

**Must answer before Step 03 starts:** D1, D4 (direction only), D7, D8, D17.
**Must answer before the relevant Step 04 items:** D2, D3, D5, D6.
**Can wait:** D9–D16.

---

## Product / business decisions

### D1 — Is Excel / Print export still planned?
- **Evidence:** `ExcelExportService` and `PrintExportService` have no importers. They are the only users of `exceljs`, `file-saver` and `@types/file-saver`; `exceljs` pulls in the `uuid` advisory.
- **Options:** **A.** Not planned → delete both services and the three dependencies (R-18). **B.** Planned → keep the code, keep the dependencies, accept the advisory until it is built or replaced. **C.** Planned later → remove now, re-add when needed.
- **Recommendation:** **A** or **C** (they are equivalent today). Dead code with a security advisory attached is a cost with no benefit; git history (once you have it) keeps the code.
- **Blocks:** R-18, part of R-19.

### D13 — Branch working hours: `00:00–00:00` and `05:00–05:00` (BR-03)
- **Evidence:** the `branches.qa.spec.ts` pins show these are currently accepted while the rule is inconsistent (a 24-hour day versus an invalid zero-length range).
- **Options:** **A.** Same open and close time means "closed" (reject for open days). **B.** `00:00–00:00` means 24 h; other equal times are invalid. **C.** Keep as is and document.
- **Recommendation:** This is a business rule I can't infer. Please tell me what the backend and the salon operators expect; I'd lean to **B** only if the API contract says so.
- **Blocks:** R-21 (BR-03 part).

### D12 — Status-toggle permission granularity
- **Evidence:** only `Chair` has a `ToggleStatus` permission. Barbers, Branches, Packages, Services, Users and Offers gate their switches with `Edit` (Offers documents "the contract has no separate permission").
- **Options:** **A.** Keep as is and document why Chair differs. **B.** Ask the backend for `ToggleStatus` on all modules. **C.** Remove `ToggleStatus` from Chair (so toggles follow `Edit` everywhere).
- **Recommendation:** **A** now; revisit **B** if reception-style roles need "flip availability only" elsewhere. It is a backend/product question, not a frontend one.
- **Blocks:** nothing urgent; affects the permission wording in the standard.

### D2 — Page-size policy
- **Evidence:** card grids use 12 (branches, chairs, packages, offers); tables use 10 (users, roles, barbers) — except **Services, a table with 20**. Only Barbers' 10 is documented (README).
- **Options:** **A.** Two named constants, `CARD_PAGE_SIZE = 12` and `TABLE_PAGE_SIZE = 10`; Services moves to 10. **B.** Same constants, Services keeps 20 as a documented exception. **C.** One global default.
- **Recommendation:** **B**, if the 20 was deliberate (a long services table is often scanned in bulk); otherwise **A**. Tell me which.
- **Blocks:** R-09.

### D3 — Users / Roles query-parameter casing
- **RESOLVED (Step 04 addendum): A.** Confirmed against the real API (Swagger curl): `/users` takes `RoleId`, `Status`, `PageNumber`, `PageSize`, `Search`; `/roles` takes `IncludePermissions`, `PageNumber`, `PageSize`, `Search`. PascalCase stays; R-15 is cancelled.
- **Evidence:** users/roles send `PageNumber`, `PageSize`, `Search`, `RoleId`, `Status`, `IncludePermissions`; everything else is camelCase. `user-query.ts` says "PascalCase names the backend binds", and the README documents PascalCase multipart fields, so this looks deliberate. ASP.NET binding is normally case-insensitive.
- **Options:** **A.** Keep PascalCase for users/roles and document it as an approved exception. **B.** Switch to camelCase **after** you confirm the Users/Roles API contract accepts it. **C.** Ask the backend developer to confirm, then choose.
- **Recommendation:** **C**, then **B** if confirmed (one convention, one util shape). Do not change it on a guess.
- **Blocks:** R-15.

### D14 — Scheduling the Step 01 M-items and the Angular patch
- **Evidence:** Step 01 asked whether M1–M7 go to Step 04 (logic) and Step 06 (fixes). I haven't seen your answer to Step 01's question 3 ("Do you approve M1–M7 being scheduled into Step 04 and Step 06?"). The standard turns BA-01, CH-02, BA-06 and BA-07 (parts of M7) into rules, so they fit Step 04 better. M5 (`@angular/*` → 21.2.26, same `^21.0.0` range) changes dependencies.
- **Options:** **A.** My split: M1–M4 + M7 in Step 04, M5 and M6 in Step 06. **B.** Your earlier split (M7 in Step 06). **C.** Pull M5 forward to the start of Step 03 (separate, tiny, low risk).
- **Recommendation:** **A**, and consider **C** if you deploy before Step 06; the advisories listed in Step 01 are mostly SSR-only and not applicable to a client-rendered app, so there is no urgency beyond hygiene.
- **Blocks:** ordering of R-10, R-11, R-19.

---

## Architectural decisions

### D4 — How production is kept free of mock code
- **Evidence (new, verified):** both DI patterns ship mocks. Token modules use `environment.useMock ? Mock : Api` in `app.config.ts`; the flag is a runtime property so both classes are bundled (mock literals found in the **initial** `main-*.js`). The mock login (any email, 6+ char password, SuperAdmin unless the email starts with `manager`) is in the bundle. It is inactive with `useMock:false`.
- **Options:**
  **A. Build-time provider swap (recommended).** `app.providers.ts` (mock + API, used in dev) replaced by `app.providers.prod.ts` (API only) through `fileReplacements`, the same mechanism already used for `environment.ts`. Production never imports a mock file. Needs an `angular.json` change and the N14 fix (below). Verified by a grep check on `dist/`.
  **B. Runtime lazy `import()`** of the mock providers only when `useMock` is true. Single config, but async provider setup and test wiring are more complex.
  **C. Leave mocks in production behind the flag.** Not recommended: the bundle keeps a login that grants full admin to any email.
- **Sub-questions:** (1) keep the any-email mock login in development? I'd keep it dev-only. (2) Should the mock DB be de-denormalised (XM-02/Q8, R-25)? Only worth doing if mocks stay a first-class dev tool.
- **Recommendation:** **A**, mock login kept for dev only, R-25 deferred.
- **Blocks:** R-01 (the P0 item), R-17, R-25.

### D17 — Pull the `build:template-brand` fix forward? (N14)
- **Evidence (new, verified):** `ng build --configuration production,brand-template` produces a bundle with `useMock:!0`, `production:!1`, `showDesignSystem:!0` because the second configuration's `fileReplacements` replaces the first's. That is a config-only trap: that build runs on mock data with the permissive login and the design-system page.
- **Options:** **A.** Fix it as part of R-01 in Step 04. **B.** Fix it right now as a tiny stand-alone change before Step 03 (a combined configuration listing both replacements; no source change). **C.** Tell me that script is never used for real deployments, and leave it to R-01.
- **Recommendation:** **B** if that script has ever produced something that was deployed or shared; otherwise **A**. I did not run the app, so I can only vouch for what is in the bundle.
- **Blocks:** nothing technical, but it is the one finding I'd not leave open for long.

### D5 — Method and type naming standard
- **Evidence:** six modules use `createX / updateX` (`createChair`), users/roles use `create / update`; users use `CreateUserRequest` where others use `CreateChairPayload`; repository method names differ (`getChairById` vs `getUser`, `toggleChairStatus` vs `toggleStatus`).
- **Options:** **A.** Standardise on `createX / updateX`, `Create<X>Payload`, `get<X>ById` (the majority). **B.** Standardise on the shorter `create / update` (reads naturally inside `ChairsService`). **C.** Leave as is.
- **Recommendation:** **A** because it is what six tested modules use and avoids renaming them; it only touches users/roles/dashboard. Low value, so do it only when those modules are already being edited (R-16).
- **Blocks:** R-16.

### D6 — One permission-gating style in templates
- **Evidence:** `@if (canX())` with computed flags (66 uses in all modules) vs the `*appCan` directive (1 use in each of users-list and roles-list; the directive is otherwise unused).
- **Options:** **A.** Computed flags only; delete `*appCan` (also makes handlers and templates read the same flag). **B.** Directive only. **C.** Keep both with a rule for when to use each.
- **Recommendation:** **A**: the handler-level checks (M3) need the same flags anyway.
- **Blocks:** small cleanup in users/roles in Step 04.

### D7 — Tooling: formatting, line endings, linting
- **Evidence:** no Prettier, `.editorconfig`, ESLint or `lint` script; quote style is double in offers/packages/services and mostly chairs/branches, single in users/roles/dashboard/profile; only 2 of 399 files have CRLF (corrected in Step 03; Step 01/02 said 50); 191 relative `../../shared|core` imports vs 124 alias imports.
- **Options:** **(a) Quote style:** double (matches the newest modules, ~majority of newer code) or single. **(b) Line endings:** normalise to LF (recommended) or keep. **(c) ESLint:** add with a `no-restricted-imports` rule (adds dev dependencies) or Prettier only. **(d) Timing:** all first, as an isolated Step 03 commit-like change (recommended: it touches every file, so it must not be mixed with logic changes).
- **Recommendation:** double quotes, LF, Prettier + `.editorconfig` now; ESLint with the import rule in the same step if you approve the new dev dependencies.
- **Blocks:** R-02, R-03 (and the readability of every later diff).

### D8 — Folder rule for forms, and shared file naming
- **Evidence:** cards live in folders, forms are loose in chairs/offers/packages/barbers/users; `role-form` has no external files; 4 shared components lack the `.component` file suffix (`float-label-input`, `float-label-select`, `feature-placeholder`, `app-toast`).
- **Options:** **A.** Every component in its own folder, `role-form` externalised; leave the 4 shared file names. **B.** A, plus rename the 4 shared files. **C.** Leave everything.
- **Recommendation:** **A**. Renaming the shared files is cosmetic and touches many imports.
- **Blocks:** R-04, R-06.

### D9 — Where does the shared service picker live?
- **Evidence:** `modules/services/components/service-picker/` is imported by Offers and Packages.
- **Options:** **A.** Move to `shared/components/`. **B.** Keep and document "a feature may export components others use". **C.** Keep, add a rule against importing across feature folders.
- **Recommendation:** **A** if a third consumer is likely; otherwise **B** (cheapest). Low priority.
- **Blocks:** R-13.

### D16 — Unsaved-changes protection on full-page forms
- **Evidence:** no `canDeactivate` anywhere; only the profile page tracks `dirty`. Branches and Services have long full-page forms.
- **Options:** **A.** Add a shared `canDeactivate` + confirm for the two full-page forms. **B.** Skip. **C.** Decide after Step 05 testing shows whether users lose data.
- **Recommendation:** **C** — a UX decision better made with real usage evidence.
- **Blocks:** nothing.

---

## Quality and tooling decisions

### D10 — Test depth and test tooling
- **Evidence:** **Users and Roles have no repository, service, list or form specs** (one util spec each). **Services and Packages** have lighter suites than Chairs/Offers (no api-repository spec for either; no mock spec for services). Barbers/Branches/Chairs have `qa` suites. There is no E2E or axe tooling, so Step 05 depends on manual testing.
- **Options:** **(a)** Require Tier-1 tests (see standard §5.7) for **all** CRUD modules → R-14. **(b)** Require Tier-1 only for modules touched in Steps 03–04. **(c)** Keep the lighter suites where you chose them deliberately. **(d) Tooling:** Playwright + axe (adds dev dependencies), or a manual checklist only.
- **Recommendation:** (a) for the security-relevant parts first (auth, guards, interceptors — R-17), (b) for the rest; for (d), a manual checklist now and Playwright later if the product is going to be maintained long-term. If Services/Packages were intentionally lighter, say so and I will record it as an approved exception.
- **Blocks:** R-14, R-17, Step 05 method.

### D11 — Promote the Offers accessibility patterns?
- **Evidence:** Offers announces results politely to screen readers after each load and restores keyboard focus when the acted-on card disappears. No other list does.
- **Options:** **A.** Make it an optional pattern (documented, not required). **B.** Make it mandatory for all lists (extract a shared helper/directive). **C.** Leave it Offers-only.
- **Recommendation:** **A** now, **B** if accessibility is a stated requirement for the product.
- **Blocks:** nothing.

---

## Out of architecture scope (still need a decision somewhere)

### D15 — Token storage in `localStorage` (Q3 / O3)
- **Evidence:** refresh and access tokens are stored in `localStorage`; a backend change (HttpOnly cookie) would be needed to improve it.
- **Options:** **A.** Accept for now, with strict CSP/XSS hygiene. **B.** Plan a backend-assisted change. **C.** In-memory access token + HttpOnly refresh cookie.
- **Recommendation:** **A** for this program, **B** as a separate security task with the backend developer. Not part of the architecture standard.
- **Blocks:** nothing.

---

## Approval needed on the standard itself

Beyond D1–D17, please confirm or amend these points in `step-02-architecture-standard.md`:

1. **Reference modules:** Chairs (primary) · Offers (branch-scoped) · Branches (full-page form/details), with the four "no module has this yet" gaps added to the standard (§2.2).
2. **Drawer vs full page rule** (§4.B): drawer for flat forms (about 6 fields or fewer), full page for nested/repeating data.
3. **All `/main` routes stay in `main.routes.ts`**, no per-feature route files (§3.3).
4. **Approved exceptions table** (§6.3), especially auth, dashboard, profile, error pages, `services.service.ts`.
5. **Mandatory list** (§6.1), especially "no mock code in production" and "handler-level permission check".
