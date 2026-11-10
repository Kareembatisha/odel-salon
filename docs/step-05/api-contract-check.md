# API contract check — OpenAPI spec vs the Angular app

Source: https://api-odel.subhe.site/swagger/v1/swagger.json (fetched 2026-11-09).
Method: read the spec and compared every path, HTTP verb, query parameter, request body and
multipart field with the app's API repositories, query builders, form-data builders and models.

**Limits:** the spec declares only `200 OK` — **no response schemas** — so response shapes (like the
`modules` change on `GET /roles/{id}`) cannot be verified from it. Nothing was called live from here.

## Matches (no action)

| Area | Result |
|---|---|
| Paths and verbs | All 9 admin modules + auth match (list, details, create, edit, toggle-status, bulk delete, services bulk status / copy-prices / adjust-prices, `PUT /roles/{id}/permissions`, `PATCH /auth/password/*`, `PUT /auth/profile`) |
| JSON bodies | Auth (login, logout, refresh, change/forgot/verify/reset), roles, users (create + edit incl. `newPassword*`), chairs, packages (create has `branchId`, edit doesn't), branches (+ `workingHours`), services (`branches[]` DTO), copy/adjust/status: field names match |
| DELETE | Body `{ ids }` everywhere |
| Enums | `ChairType` 0/1 and `OfferStatus` 0–4 match |
| Multipart field names | Barbers (`BranchId, FullName, Phone, Image, RemoveImage`), Offers (`NameAr … Image, RemoveImage`), Profile (`FullName, Email, CountryCode, PhoneNumber, Image, RemoveImage`) |
| Users / Roles query | PascalCase, exactly as the spec (`RoleId, Status, PageNumber, PageSize, Search, IncludePermissions`) |

## Differences / things to check

| # | Finding | Severity | Notes |
|---|---|---|---|
| 1 | **No dashboard endpoint in the API.** The app calls `GET /dashboard/summary`; the spec has no such path. | Known | Already documented in the README: against the real API the dashboard shows its "couldn't load" state. Needs a backend endpoint or a product decision (hide the page / compute from other endpoints). |
| 2 | **`Id` in the multipart body of `PUT /barbers/{id}` and `PUT /offers/{id}`.** The spec lists an `Id` form field next to the route id; the app sends only the URL id. | Check | If those two updates return 400/validation errors on the real API, look here first. Probably the server fills it from the route, but the spec can't say. |
| 3 | **Query names are PascalCase in the spec for every module**, while Barbers, Branches, Chairs, Offers, Packages and Services send camelCase (`pageNumber`, `branchId`, …). | Low / expected OK | ASP.NET Core binds query strings case-insensitively, so both should work, but this was not tested live. Users/Roles are the only modules matching the spec's casing literally. The "camelCase vs PascalCase" split is therefore cosmetic, not a contract issue. |
| 4 | **Unused endpoints:** `PUT /services/{id}/branches/{branchId}`, `PATCH /services/{id}/branches/{branchId}/toggle-status` (the app uses the bulk `…/branches/status` instead), and the whole `/customer/*` surface (customer app, not this admin). | Info | No action. |
| 5 | **Response shapes unverified.** `GET /roles/{id}` is already known to return `modules`. Other detail/list responses (e.g. `meta.additionalData` summaries for Offers/Chairs, `PaginationMeta`, `LoginResponseData`) were written against earlier contract notes and could differ. | Open | Best checked with real JSON from: `/auth/login`, `/roles`, `/users`, `/users/{id}`, `/branches`, `/branches/{id}`, `/chairs`, `/barbers`, `/barbers/{id}`, `/services`, `/services/{id}`, `/packages`, `/offers`, `/offers/{id}`, `/auth/profile`. |
