# Bookings and Payment reviews — work log

Two new modules from `API Contract — Admin Bookings`: **Bookings** (`/main/bookings`, details
`/main/bookings/:id`) and **Payment reviews** (`/main/bookings/payment-reviews`). Delivered in six steps;
each step ends with a ZIP.

## Plan

| # | Step | Status |
|---|---|---|
| 1 | Foundation: permissions, models / enums, labels and date utils, query builders, API repositories, base i18n, tests | **done** |
| 2 | Mock backend: seed, mock repositories with 404 / 409 / 400 rules, providers (dev + prod), roles | **done** |
| 3 | Bookings list page: route, sidebar section, tabs + counters, filters, table, pagination | **done** |
| 4 | Booking details page: cards, "End session" | **done** |
| 5 | Payment reviews page: tabs + KPIs, cards, proof viewer, approve / reject | **done** |
| 6 | Polish and delivery: README, QA checklist, RTL / dark / mobile pass, full check | **done** |

## Decisions (agreed before step 1 — none needs a backend change)

1. **"Refund sent"**: the contract has `actions.canMarkRefunded` but no endpoint to mark a refund. The
   UI shows the refund data only; the action is NOT built. Ask the backend for an endpoint, then add it.
2. **Customer profile**: there is no Customers module. The details page shows the customer's name,
   visits and missed count and a `tel:` call button, without a profile link.
3. **`Booking.Cancel`** stays in the catalog untouched (not used by this contract).
4. **Queue refresh**: payment reviews reload on tab focus and every 60 s while the tab is visible, plus
   a manual refresh button.
5. **Details** are a page (`/main/bookings/:id`), not a drawer — deep-linkable.
6. **Routes**: `/main/bookings`, `/main/bookings/payment-reviews`, `/main/bookings/:id` (the static
   `payment-reviews` route is declared BEFORE `:id`). The sidebar gets a "Bookings" section with two items.

## Step 1 — Foundation (done)

| Area | What was added |
|---|---|
| Permissions | `Booking: View, Review, Manage, Cancel` (`Review` approves / rejects payments, `Manage` ends a session). `PERMISSIONS.ACTIONS.Review` label ("Review payments") so the role matrix shows it |
| Models | `modules/bookings/model/booking.model.ts` (enums `BookingTab`, `BookingStatus`, `BookingType`, `PaymentMethod`, `RefundStatus`; list item, details, query, counters, actions) and `modules/payment-reviews/model/payment-review.model.ts` (tab, item, counters, query, reject body, `REJECT_REASON_MAX_LENGTH = 500`) |
| Utils | `booking-query.ts` (repeated `statuses`, zero-valued filters are sent), `payment-review-query.ts`, `booking-counters.util.ts` (`meta.additionalData` → numbers, 0 fallback), `booking-labels.util.ts` (i18n keys + badge variants, `Started` when `isInProgress`, `Unknown` fallbacks, localized service names), `booking-dates.util.ts` (`startAt` is Cairo wall-clock WITHOUT offset: parsed by hand, formatted as a pure calendar value, `cairoNow`, `isBookingStarted`, `cairoStartAt`) |
| Repositories | `IBookingRepository` + `BookingApiRepository` (`getBookings`, `getBookingById`, `completeBooking`); `IPaymentReviewRepository` + `PaymentReviewApiRepository` (`getPaymentReviews`, `approveBooking`, `rejectBooking`). Tokens `BOOKING_REPOSITORY` / `PAYMENT_REVIEW_REPOSITORY` |
| i18n | `BOOKINGS.TAB / STATUS / TYPE / PAYMENT_METHOD / REFUND`, `PAYMENT_REVIEWS.TAB`, `PERMISSIONS.ACTIONS.Review` (EN + AR). Page-specific keys come with each page |
| Tests | Enum values vs the contract, query builders, counters, labels (every key exists in EN and AR), dates (winter / summer Cairo time, midnight, DST-safe), both API repositories, permissions |

Not wired yet on purpose: the tokens are NOT in `app.providers.ts` / `app.providers.prod.ts` (the dev
file needs the mock repositories first) — step 2 adds them to both files together, as `check:providers`
requires.

Notes for later steps:
- The old string-union `BookingStatus` in `shared/utils/status-badge.util.ts` is an unused sketch; the
  API enum in `booking.model.ts` is the one to use.
- The payment-review list has **no `bookingNumber`** (only `id`), so that page shows `#<id>`.
- `homeAddress` is typed as `string | null` (the contract only shows `null`).

## Step 2 — Mock backend (done)

| Area | What was added |
|---|---|
| Data | `MockBooking` / `MockCustomer` in `MockDb`; `core/mock/mock-bookings.ts` builds **62 bookings** (42 in the first branch, a few in branches 2–5) with dates relative to NOW in Cairo, from the existing branches, barbers, chairs and services. First branch: 5 waiting for review (2 late, 1 with a proof for LESS than the total), 4 confirmed to come (2 approved today), 1 in progress, 1 rejected today, and history of completed / cancelled / missed / expired / rejected with refunds. Home bookings live in branches that allow them (Nasr City, Heliopolis, New Cairo). Payment proofs are generated receipt images (`data:` URLs — no files, work offline) |
| Rules | `settleBookings` runs before every call: a booking nobody reviewed EXPIRES at its start time (full refund owed), an open Confirmed one COMPLETES 2 h after it ends. `isBookingInProgress`, `canCompleteBooking`, waiting minutes / `isLate` (target 30 min), customer visits / missed counts across branches |
| Bookings repo | tabs (Today / Upcoming soonest first, All / Past newest first), filters (barber, type, statuses, inclusive dates, refund 0/1, search by number `#OD-000482` / `OD-000482` / `482`, name, phone), counters of the selected branch that filters don't move, page size clamped to 100, `400` for `dateTo < dateFrom`, `404` body for a missing booking, details with derived chair / branch / rating / customer stats / actions, "End session" with `409` (not started / not Confirmed) and `404` |
| Payment reviews repo | tabs ToReview (soonest first) / ApprovedToday / RejectedToday (latest first), the branch's badges + `reviewTargetMinutes`, `waitingMinutes` / `isLate` on ToReview only, approve (`409` unless PendingReview, `404`), reject (`400` empty / > 500 reason, then `404`, `409`); the reason is kept for the customer |
| Shared | `core/mock/mock-responses.ts` (reply / paged reply / 404 body / toast + error helpers) |
| Providers | `BOOKING_REPOSITORY` and `PAYMENT_REVIEW_REPOSITORY` in BOTH `app.providers.ts` (mock when `useMock`) and `app.providers.prod.ts` (API only) — `check:providers` now sees 12 tokens |
| Roles | the mock `BranchManager` gets `Booking.Review` and `Booking.Manage`; the receptionist keeps `View` / `Cancel` only (handy to test a user who can look but not review or end sessions) |
| i18n | `BOOKINGS.ERRORS` (NOT_FOUND, NOT_STARTED, NOT_ALLOWED, INVALID_DATE_RANGE), `PAYMENT_REVIEWS.ERRORS` (REASON_REQUIRED, REASON_TOO_LONG), `VALIDATION_FIELDS.Reason / DateTo` (EN + AR) |

### One database for three screens
The barbers' "upcoming bookings" used to be a stored count (3 and 1). It is now DERIVED from the bookings
(`MockDb.upcomingBookingsCount`: pending / confirmed and not over yet), so rejecting a waiting booking or
ending a session frees a present barber, and attendance's `409` follows the real data. The first barber
(5 upcoming) starts present; the second barber of the first branch has none. The old barber specs now
build bookings with `upcomingBookingsFor(barberId, n)` instead of writing a count.

Tests use a fixed clock (Cairo 12:00) so relative seed offsets never cross midnight and counts are exact.

Notes for the pages:
- `meta.additionalData` is read with `readBookingCounters` / `readPaymentReviewCounters`.
- A read for a missing booking answers a `status: false` 404 body (no toast); the mutations toast the
  error, like the barbers mock does.

## Step 3 — Bookings list page (done)

| Area | What was added |
|---|---|
| Route / sidebar | `/main/bookings` (lazy, `Booking.View`, breadcrumb "Bookings") and a **Bookings** sidebar section (after Salon, before the developer links) with one item, `pi-calendar`. The Payment reviews item joins it in step 5 |
| Service | `BookingsService`: first (oldest) branch by default (no "all branches": the counters belong to one branch), every filter change reloads from page 1, only the latest response may write the rows (stale guard + in-flight cancel), a failed reload keeps the rows and sets `hasError`, counters come from `meta.additionalData` and stay `null` until a response brings them, switching branch drops the old rows / counters and the barber filter (that barber belongs to the branch that was left), the barber options of the branch (suspended ones too) load with it |
| Page | `BookingsList`: period tabs (All / Today with the branch's count / Upcoming / Past), branch select, search (number, customer, phone), barber, type and status selects, From / To dates, a **Refund waiting N** chip (one-click refund filter, count is the branch's), "Clear filters", table (booking + VIP/Home badge, date + time, customer + call link, services, barber, amount + method, status + refund line + missed fee) and the same data as cards on narrow screens, paging (20 per page) |
| States | skeleton on the first page, no branches, no bookings yet, no match (with "Clear filters"), failed with retry, and a compact retry above the rows when only a reload failed |
| Date range | An end date before the start date is NOT applied (the API would answer 400): red field + message; a later start date drops the old end date |
| Shared | `app-date-filter` (`shared/components/date-filter`): label + native date input styled like `app-filter-select`, controlled, `min` / `max`, `invalid` |
| Accessibility | tabs ↔ panel (`aria-controls` / `aria-labelledby`), polite live region ("Showing 20 of 42 bookings"), table caption, `aria-pressed` on the chip, dates and phones stay left-to-right in RTL |
| i18n | `BOOKINGS.*` page keys (EN + AR), `LAYOUT.SECTIONS.BOOKINGS`, `LAYOUT.NAV.BOOKINGS` |
| Tests | service (stale guard, filters, branch switch, errors), page (rows, badges, refunds, tabs / counters, every filter, date range, chip, clear, branch switch, paging, states, a11y, Arabic), date-filter, wiring, sidebar |

Not clickable yet on purpose: rows open the details page, which is step 4. The "status" filter sends ONE
status (the service accepts a list; the contract's repeated `statuses` is covered by the query builder).

## Step 4 — Booking details page (done)

| Area | What was added |
|---|---|
| Route | `/main/bookings/:id` (lazy, `Booking.View`, breadcrumb trail "Bookings / <booking number>" — the number replaces the static label after load). The list rows and a real link on the booking number open it (the link stops the click so the row doesn't navigate twice). The Bookings sidebar item stays active on it. A wiring test guards that every static `bookings/*` route is declared before `bookings/:id` (step 5 adds `bookings/payment-reviews`) |
| Service | `BookingDetailsService`: `getBooking` tells a MISSING booking (HTTP 404 or a `status:false` 404 body) from a load failure; `complete` runs with a pending-counter `saving` flag, toasts our own localized `BOOKINGS.SESSION_ENDED`, and answers `false` on a failure (the interceptor / mock already toasted the 404 / 409 reason) |
| Page | `BookingDetailsPage`: header (number, long date, time; status — "Started" when in progress —, type badge, duration), **Appointment** (barber + rating or "No reviews yet", chair, branch, home address for Home), **Services & payment** (each service with duration and price, subtotal, method, total), **Refund** (status, amount, missed-booking fee — only when the booking has one), **Customer** (name, call link, completed visits, missed bookings, Call button) |
| End session | Shown when the SERVER says `actions.canComplete` and the user has `Booking.Manage`; asks for confirmation naming the booking and customer; afterwards the booking is RE-READ so the status and allowed actions are the server's. It is re-read after a failure too (409 / 404): what the page showed was out of date. A booking that is Confirmed but not started shows "You can end the session once it starts." |
| States | skeleton, "this booking doesn't exist" (own message, no retry), failed with retry, and a failed RE-read keeps what is on screen |
| Utils | `formatBookingDateLong` ("Friday, November 13, 2026", not moved by the browser time zone) |
| i18n | `BOOKINGS.DETAILS.*` and `BOOKINGS.SESSION_ENDED` (EN + AR) |
| Tests | service (missing vs failed, saving counter), page (every card, refund with / without fee, End session permission / confirm / cancel / success / 409 / 404 / failed re-read / double confirm, states, invalid ids, Arabic), list (row click, card click, number link, no double navigation), wiring, sidebar |

Not built, as agreed: **"Refund sent"** (`actions.canMarkRefunded` has no endpoint in the contract —
ask the backend; the page never offers it) and the **"Customer profile"** link (no Customers module —
a test guards that there is no such link).

## Step 5 — Payment reviews page (done)

| Area | What was added |
|---|---|
| Route / sidebar | `/main/bookings/payment-reviews` (lazy, `Booking.View`, breadcrumb "Bookings / Payment reviews") declared BEFORE `bookings/:id` (a test guards the order); a **Payment reviews** item (`pi-credit-card`) under Bookings in the sidebar |
| Service | `PaymentReviewsService`: first (oldest) branch by default, tab + page, stale-response guard, tab badges and `reviewTargetMinutes` from `meta.additionalData` (`null` until a response brings them). **Quiet reload** (`refresh`): no skeleton, rows stay, a failed background reload is ignored; skipped while the skeleton load runs. `approve` / `reject` track `pendingIds` per booking (only that card locks), toast our own localized message, answer `false` on any failure and reload quietly either way (a 409 / 404 means the queue was out of date); the page steps back when the last booking of a later page leaves |
| Page | `PaymentReviewsPage`: tabs To review / Approved today / Rejected today (each with the branch's count), branch select, "Review time N min" (hidden when the server sends 0), "Updated 12:05 PM" (salon time) and a Refresh button (spinner while reloading). One card per booking: `#id` (the list has no booking number), VIP / Home badge, **Waiting N min** with a red edge **and a "Late" badge** when `isLate` (not colour alone), the screenshot (a button), **amount due** (the number to compare with the screenshot), method, customer + call link, services, start. Reviewed tabs show the status instead and no actions |
| Auto refresh | every 60 s while the tab is visible, on window focus and on tab-visible; the interval runs OUTSIDE the Angular zone (a never-ending interval would keep the app "unstable" for ever) and re-enters it only to reload; cleared on destroy |
| Approve | needs `Booking.Review`; asks for confirmation that repeats the amount due and the method ("#489 for X will be confirmed. Amount due: EGP 340 via InstaPay.") |
| Reject | new `app-reject-dialog`: a reason is REQUIRED (blank counts as empty), max 500 (typing and pasting), live counter, "the customer will see this reason", starts empty every time it opens, trimmed before sending |
| Proof viewer | new `app-proof-viewer`: the screenshot large (scrolls inside the box), Escape / backdrop / button close, focus trapped and restored, "Open original" only for real web addresses (a `data:` image can't be opened in a new tab) |
| i18n | `PAYMENT_REVIEWS.*` page keys (EN + AR), `LAYOUT.NAV.PAYMENT_REVIEWS` |
| Tests | service (25), reject dialog (12), proof viewer (10), page (47: cards, late, tabs / badges, refresh button / timer / hidden tab / focus / destroy, approve and reject flows incl. 409, per-booking lock, double confirm, permission, viewer, states, paging, announcement, Arabic), wiring, sidebar |

Test-build note: with the service spec in the SAME run, a class field `= REJECT_REASON_MAX_LENGTH` came
out `undefined` at construction (the production bundle is fine — checked in the built chunk). The page
now reads it through a getter when the dialog binds, which is stable in every combination.

## Step 6 — Polish and delivery (done)

- **README** — route map (3 routes), the mock sign-in table (new `receptionist@odel.com`), structure, new **Bookings** and **Payment reviews** sections (rules, states, mock seed, accessibility, what is not built) and notes.
- **QA checklist** — `BK-01…11` (list), `BD-01…12` (details), `PR-01…18` (review queue), each with steps and the expected result; the real-API cases are marked.
- **Mock sign-in** — a third demo identity, `receptionist@…` (view-only: `Booking.View` / `Cancel`), so "can look but not act" can be tried without a backend (first spec for `AuthMockRepository`). The roles screen's seeded Receptionist role uses the same permission list.
- **Translation audit** — every static key used by the new code exists in BOTH languages (checked by script: 0 missing), plus the keys passed to `notify.success(...)`.
- **Style audit (RTL / dark / mobile, by reading — not in a browser)** — no `left` / `right` / `margin-left` / `padding-right` / `text-align: left|right` in the new styles (logical properties and `start` / `end` only); no hard-coded colours except one white icon on the dark scrim; every colour is a theme token, so both themes follow; the back arrow flips in RTL; booking numbers, phones and dates are isolated left-to-right; narrow layouts: list rows become cards, details items stack their duration, review cards put the screenshot above the facts and the buttons share the width.
- **Full check** — see the delivery message.

### Questions for the backend (none blocks the frontend)
1. **Mark a refund as sent** — `actions.canMarkRefunded` exists, but there is no endpoint. Which one? (The UI will add *Refund sent* next to *End session*.)
2. **`homeAddress`** — the contract only shows `null`: a string, or an object (street, area…)?
3. **Payment-review list** — can it return `bookingNumber`, so the cards can show `OD-000489` like the Bookings list does instead of `#489`?
4. **Customer profile** — is there / will there be a customers endpoint (for the "Customer profile" link and `customer.id`)?
5. **Out-of-range paging / `dateTo < dateFrom`** — the mock answers `400` for the dates and returns an empty page beyond the last; please confirm the real behaviour.
6. **`Booking.Cancel`** — still in the permission catalog; is it used by a future "cancel booking" endpoint?

### Not verified (needs a browser or the real API)
Real API behaviour (the envelopes are assumed to match the contract PDF), actual rendering in RTL / dark / narrow viewports, screen-reader announcements, the 60-second refresh in a real background tab, loading of real screenshot URLs. Run the QA sections BK, BD and PR for those.

## Fix after delivery — filters survived leaving the page

**Reported:** on the Bookings and Payment reviews lists, applying a filter, going to another page and coming back kept the filter.

**Cause:** both services are singletons and their `initialize()` deliberately kept the query between visits (I even wrote a test that asserted it). The other lists (Offers, Packages, Chairs) reset the search, tab, filters and paging on every `initialize()` and keep only the selected branch, because the widgets start empty — what is on screen must be what is applied.

**Fix:** `BookingsService.initialize()` and `PaymentReviewsService.initialize()` now reset the query (tab All / To review, search, barber, type, status, dates, refund filter, page) and keep the selected branch. Rows loaded under the old filters (or for another tab) are dropped so they don't show under the cleared widgets while the list reloads; an unfiltered list stays on screen while it refreshes (no flash of emptiness); the branch's counters are kept (they don't depend on the filters). A date-range error from the previous visit is cleared too.

**Tests:** the two "keeps the filters" service tests became "keeps the branch" + "starts clean"; added: stale rows dropped only when something was filtered, counters kept, and page-level "coming back" tests for both pages (widgets empty, request clean, branch kept, no stale rows).

Note: going back from the details page to the list also starts clean (same as every other list in the app). If you would rather keep the filters ONLY when returning from the details page, that needs the filters kept in the URL (query params) — say so and I will add it.
