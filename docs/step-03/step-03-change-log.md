# Step 03 — Structure Alignment: Change Log

Scope: structure, naming and tooling only. **No runtime behaviour was changed** (verified below).
Preceded by the stand-alone D17 change (`build:template-brand` now applies the production environment).

## What changed

| ID | Change | Result |
|---|---|---|
| R-02 | Prettier (double quotes, LF, width 100, `embeddedLanguageFormatting: off`), `.editorconfig`, `.prettierignore`, `format` / `format:check` scripts; all `ts`, `scss`, `json` under `src/` formatted | 2 CRLF files normalised (Step 01's "50" was wrong). **Angular HTML templates and inline templates were deliberately left unformatted** (see Open points) |
| R-18 | Removed `ExcelExportService`, `PrintExportService`, `FeaturePlaceholder`, the unused `shared/components/index.ts`; uninstalled `exceljs`, `file-saver`, `@types/file-saver` (93 packages) | Production audit 10 → 7 findings; `uuid` advisory gone |
| R-04 | Every form component in its own folder: chairs, offers, packages, barbers, users (`components/<x>-form/`), with imports updated | Same file contents, new paths |
| R-06 | `role-form`: inline template and styles moved to `role-form.html` / `role-form.scss` (and into `role-form/`) | Template text identical |
| R-03 | ESLint 9 + typescript-eslint + angular-eslint, flat config, `lint` script. Rules: no deep relative imports into `shared/` / `core/`, no `any`, OnPush + standalone required, non-null assertions reported as **warnings** | 0 errors, 13 warnings (the existing non-null assertions; fixed in Step 04) |
| R-03 | 211 deep relative `shared/core` imports in 45 files rewritten to `@shared/*` / `@core/*` | Code-neutral |
| R-13 / R-20 | `README.md`: removed export from the stack, new *Architecture standard* section (structure rules, approved exceptions, `service-picker` cross-feature note per D9 B, formatting/lint commands), correct instructions for adding brand configurations (N14) | Docs only |
| D10 (part) | Tier-1 specs for modules touched here: `package-api.repository.spec`, `user-api.repository.spec`, `role-api.repository.spec`, `users.wiring.spec`, `roles.wiring.spec` | +26 tests |

## Verification (builds and tests run before and after)

| Check | Before (Step 01 + D17) | After |
|---|---|---|
| `ng build` (production) | OK | OK, no warnings |
| `npm run build:template-brand` | OK (`useMock:!1`, template brand applied) | same |
| Tests | 82 files, 1128 passed, 25 expected fail | 87 files, **1154 passed**, 25 expected fail |
| `prettier --check` / `eslint` | not available | clean / 0 errors, 13 warnings |
| Development bundle vs the original (79 chunks, compared after normalising whitespace, comments, debug line numbers and paths) | — | 73 identical; the other 6 differ **only** in the file-path comment of the moved forms (role-form: inline → external style comment) |

## Open points (not changed, for your information)

1. **HTML formatting:** a Prettier pass over templates changed compiled output (text nodes gained leading/trailing spaces around `{{ }}`). Without a browser I can't rule out spacing shifts, so templates stay as they were until Step 05 QA.
2. **`@media print` block in `styles/styles.scss`** was written for the removed print service; it is now unused (and hides everything when printing). Left untouched.
3. **Dev-tooling audit:** the lockfile now has 58 findings versus 50 before, all in dev-only packages (`eslint` tree plus the existing Angular CLI/Vitest tooling); none reach the bundle. Production-dependency findings fell from 10 to 7; the remaining ones are `@angular/*` (M5, Step 06).
4. **Tests for Users/Roles services and forms, and for auth / guards / interceptors (R-17)** are written in Step 04, after the DI change (R-01) and the form/service changes they would otherwise have to be rewritten for.
5. Step 01's "50 CRLF files" and my confirmation of it were wrong; corrected in the Step 02 docs.
