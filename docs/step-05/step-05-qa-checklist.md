# Step 05 — Manual QA Checklist (real API)

**Who runs it:** you, in a real browser. I can't open a browser or reach the API from my environment.
**How to report:** fill the *Result* column (✅ pass · ❌ fail · ⚪ not applicable) and send me the failures with: the ID, a screenshot, and — for anything involving data — the failing request from DevTools → Network (URL, status, response body) and any Console error. I'll turn them into the Step 06 fix list.

## 0. Setup

| What | Notes |
|---|---|
| App under test | Either the Vercel deployment (production build, the one that matters) or `npm start` (development build). **Test the Vercel one at least for sections A, S and P.** |
| Browser | Chrome (primary) + one of Firefox/Safari for A-01, L-02, L-05 |
| DevTools | Keep **Network** and **Console** open the whole time; tick "Preserve log" |
| Accounts | A SuperAdmin; plus a **limited user** you create in section R (a role with only a few permissions) |
| Test data | Create 2 branches, 3 chairs, 3 barbers, 3 services (priced in both branches), 2 packages, 2 offers, 12+ rows in at least one list (to see pagination) |
| Languages | Run every section once in **EN (LTR)** and spot-check in **AR (RTL)** |

## A. Access, session, deployment

| ID | Steps | Expected | Result |
|---|---|---|---|
| A-01 | Open the deployed app, open DevTools, sign in | Request to `api-odel.subhe.site/api/v1/auth/login` succeeds, **no CORS error** in Console | |
| A-02 | Sign in with a wrong password / unknown email | Clear error toast, stays on login, button re-enabled | |
| A-03 | Sign in, then refresh the page on `/main/users` | Still signed in, same page (SPA rewrite works) | |
| A-04 | Paste `/main/branches` while signed out | Redirected to login; after login lands on `/main/branches` (returnUrl) | |
| A-05 | Open `/login?returnUrl=https://evil.com` signed in | Goes to `/main`, never off-site | |
| A-06 | Open a non-existent URL `/main/xyz` and `/xyz` | 404 page, nav still usable | |
| A-07 | Sign out | Back at login; browser **Back** doesn't reveal protected pages; token keys gone from localStorage | |
| A-08 | Two tabs signed in; sign out in tab 1 | Tab 2 goes to login by itself | |
| A-09 | Let the access token expire (or delete it in DevTools → Application) and click around | Silent refresh; the action succeeds, or you're sent to login cleanly — no endless spinner / loop | |
| A-10 | Forgot password: empty and malformed email, then a real one | Inline error for bad input; a real email moves to the code page | |
| A-10b | Code page: open `/email-verification` directly (no email in the URL) | Sent back to forgot-password | |
| A-10c | Code page: wrong code; correct code; paste a code (`98-76` style); wait for the timer | Wrong code shows an error and doesn't navigate; the 4 digits verify automatically; paste fills the boxes; "resend" is disabled for 45 s, then works and restarts the timer | |
| A-10d | Reset page: open `/create-new-password` without a token; weak password; mismatching confirmation; strong password | No token → forgot-password; strength meter follows the rules; strong password → success page | |
| A-10e | Success page → "go to login", then sign in with the NEW password (old one must fail) | Works as described | |
| A-11 | Profile: change name/phone/image; change password | Saved; header name/avatar update immediately | |
| A-12 | **Landing page after login** (the dashboard was removed) | `/main` sends you to the first sidebar section you can open (SuperAdmin → Users). A limited user lands on their own first permitted section; a user with nothing lands on the profile. No blank page, no "No access" flash | |
| A-13 | Server-side validation message in **Arabic**: e.g. create a user with an email that already exists (or any 400 with field errors) | The toast names the field in Arabic (e.g. "البريد الإلكتروني"), not the English field name | |

## L. Layout, language, responsive, keyboard

| ID | Steps | Expected | Result |
|---|---|---|---|
| L-01 | Switch EN ⇄ AR on every list and every form | Everything translated, direction flips, no overlapping/clipped text, icons/chevrons mirror correctly | |
| L-02 | Widths 360 px, 768 px, 1280 px on Users, Chairs, Services, Branch form | Sidebar collapses, tables scroll or reflow, drawers fit, no horizontal page scroll | |
| L-03 | Dark/theme or brand toggles if present | Contrast OK, nothing unreadable | |
| L-04 | Keyboard only: Tab through a list, open a drawer with Enter, press **Esc** | Visible focus ring, focus stays inside the drawer, Esc closes, focus returns to the button that opened it | |
| L-05 | Open a confirm dialog and press Esc / click the backdrop | Cancels, nothing deleted | |
| L-06 | Sidebar and breadcrumbs | Active item highlighted (also on details/edit pages); breadcrumbs now **start at the section** (no "Dashboard" crumb), text correct on list, details and edit pages | |
| L-07 | Toasts | Appear in the right corner for the language, auto-dismiss, readable in AR | |

## S. Every list (repeat for each module in section M)

| ID | Steps | Expected | Result |
|---|---|---|---|
| S-01 | First load | Skeleton while loading, then rows; no flash of "empty" first | |
| S-02 | Search a term, then clear it | Results filter; clearing restores; typing then deleting a trailing space doesn't reload | |
| S-03 | Each filter / tab / branch selector | Results and counts update; page resets to 1 | |
| S-04 | Pagination (go to page 2, then change a filter) | Correct rows; filter change returns to page 1 | |
| S-05 | Filter to zero results; and an empty module | "No matches" vs "nothing yet" messages differ | |
| S-06 | Go offline (DevTools → Offline), reload the list | Error state with Retry; Retry works when back online | |
| S-07 | Throttle to Slow 3G and type quickly in search | No stale results overwrite newer ones | |
| S-08 | Delete the **only row on the last page** (page 2+) — Users, Roles, Barbers, Chairs, Services… | Table moves to the previous page, never an empty page (fixed in Step 06 for Users/Roles) | |
| S-09 | Double-click Save / Delete / toggle | Only one request in Network | |
| S-10 | Cancel / close a form with unsaved input | Drawer closes without saving (note whether you'd expect a warning — decision D16) | |

## M. Module cases (in addition to S)

### Chairs
| ID | Steps | Expected | Result |
|---|---|---|---|
| C-01 | Branch, type and status filters + summary cards | Counts match the filtered data | |
| C-02 | Create (branch pre-selected from the filter; open the drawer **quickly after page load**) | Branch is pre-selected even if options arrive late; name `"   "` rejected; 101-char name rejected; name with spaces around valid text accepted and saved trimmed | |
| C-03 | Edit | Branch is locked; type/name editable; saved | |
| C-04 | Duplicate name in the same branch (if the API enforces it) | Server error shown as a toast; drawer stays open with the values | |
| C-05 | Toggle active/inactive, delete | Counts and list update; confirm dialog names the chair | |

### Barbers
| ID | Steps | Expected | Result |
|---|---|---|---|
| B-01 | Create with image (jpg/png/webp) and Egyptian mobile number | Saved, image shown | |
| B-02 | Invalid phone (**letters inside the number**, wrong prefix, too short); image over 5 MB or not jpg/png/webp. Separators like `0100-123-4567` or `+20 100 123 4567` must still be accepted | Inline error, nothing sent; valid formats accepted | |
| B-03 | Edit: change image, then remove image | Image updates / is removed | |
| B-04 | Select 3 rows, bulk delete; then delete one row while others are ticked | Bulk works; the **other ticks stay** after a single delete | |
| B-05 | **Edit a barber on the real API** | Update succeeds (watch for a 400 mentioning `Id` — finding S5-05) | |
| B-06 | Branch filter and toggle | Works; toggle disabled while a request runs | |

### Barber attendance (`/main/barbers/attendance`)
| ID | Steps | Expected | Result |
|---|---|---|---|
| AT-01 | Sign in as `manager@odel.com` (has `Barber.Attendance`), open **Attendance** in the sidebar | Page opens on the **first branch**, today's date shown, "N of M present"; sidebar highlights Attendance (not Barbers) | |
| AT-02 | Flip a barber to Present | Row turns Present at once, no toast, only that switch is disabled while saving; the counter updates | |
| AT-03 | The first barber (present on open, upcoming bookings) | Switch is **disabled**, the row shows "5 upcoming bookings" and why it can't be marked absent | |
| AT-04 | Mark the third barber (upcoming bookings) present, then try Absent. Then reject / end their bookings in Payment reviews / Bookings and try again | Absent is blocked (disabled + explanation) while bookings are open and nothing is sent; it works once none are left | |
| AT-05 | Change branch | Old rows disappear at once, the new branch's sheet loads; a slow answer for the old branch never overwrites it | |
| AT-06 | Role without `Barber.Attendance` (e.g. a custom role with `Barber.View` only) | No sidebar item; `/main/barbers/attendance` lands on *No access*; the Barbers page is unaffected | |
| AT-07 | Arabic + dark mode, then a 375px viewport | RTL layout, date and counts in Arabic, no horizontal scroll, switch and badge stay on the row | |
| AT-08 | Keyboard + screen reader | Switches reachable with Tab, named "Mark <name> present/absent"; the live region announces each save | |
| AT-09 | Leave the tab open past midnight (Cairo), return to it | Sheet reloads on focus and shows the new date; yesterday's marks don't count | |
| AT-10 | **Real API:** mark absent a barber who got a booking after the page loaded | Server's `409` message shown once, sheet refreshes with the new count | |

### Bookings (`/main/bookings`)
| ID | Steps | Expected | Result |
|---|---|---|---|
| BK-01 | Open **Bookings** in the sidebar (mock: `manager@odel.com` or `admin@odel.com`) | Opens on the **first branch**, tab *All*, 20 rows of 42, newest first; the *Today* tab shows a count; the **Refund waiting** chip shows a count; sidebar highlights Bookings | |
| BK-02 | Click *Today*, *Upcoming*, *Past* | Today / Upcoming soonest first, Past newest first; Upcoming = waiting + confirmed that haven't ended; the *Today* count and the chip count don't change | |
| BK-03 | Search `OD-000401`, `#OD-000401`, `401`, a customer name, a phone with and without `+20` | Each finds the booking; clearing the search brings the list back | |
| BK-04 | Filter by barber, type, status (try *Waiting for branch* = value 0 and *Regular* = value 0), then combine two | Rows match; the counters don't move; *Clear filters* appears and resets everything including the tab | |
| BK-05 | Click the **Refund waiting** chip, click it again | First click: only bookings with a refund still owed (all show *Refund waiting*); `aria-pressed` toggles; second click removes the filter | |
| BK-06 | Pick **From** later than **To** (type it by hand if the picker blocks it) | Red field + message, no request is sent; a later *From* drops the old *To* | |
| BK-07 | Switch branch | Old rows and counters disappear at once; the barber filter is cleared and lists the new branch's barbers; other filters stay | |
| BK-08 | Look at a missed (NoShow) and a cancelled row | *Refund waiting · EGP …* (amber) or *Refund sent · …*; the missed one also shows *EGP … fee*; the in-progress one says **Started** | |
| BK-09 | Page 2 and 3, then change a filter while on page 3 | Pager works; a filter change returns to page 1 | |
| BK-10 | Click a row, and Tab to a booking number and press Enter | Both open the details; clicking the number doesn't navigate twice | |
| BK-11 | **Real API:** compare the *Today* count, the *Refund waiting* count and `totalCount` with the numbers in DevTools → Network (`meta.additionalData`) | They match; with a search active they still match the unfiltered counters | |
| BK-12 | Pick a tab, a search, filters, a date range and page 2, open another sidebar page (or a booking), then come back to **Bookings** | Starts clean: tab *All*, empty search and selects, no dates, chip off, page 1, no *Clear filters*; the branch you chose is still selected; no filtered rows flash while it reloads | |

### Booking details (`/main/bookings/:id`)
| ID | Steps | Expected | Result |
|---|---|---|---|
| BD-01 | Open a Confirmed, started booking (mock: the one marked **Started**) | Header, Appointment (barber + rating, chair, branch), Services & payment (rows add up to Total), Customer (call link, visits, missed); **End session** is visible | |
| BD-02 | Open a Home booking (Nasr City) | Home address instead of a chair; Home badge | |
| BD-03 | Open a barber with no reviews | *No reviews yet* instead of a rating | |
| BD-04 | Open a Cancelled / Missed / Expired booking | A **Refund** card with status and amount (and the fee for missed); no *End session*; **no** "Refund sent" button (not in the contract) | |
| BD-05 | **End session** → *Cancel* | Dialog closes, nothing changes | |
| BD-06 | **End session** → confirm | Toast *Session ended*, status becomes *Completed*, the button disappears; the barber's upcoming count in Attendance drops by one | |
| BD-07 | Open a Confirmed booking that hasn't started | No button; the text *You can end the session once it starts.* | |
| BD-08 | Open a booking in one tab, end it from another tab, then press *End session* in the first | The error explains why (409), the page re-reads and shows the real status | |
| BD-09 | `/main/bookings/999999`, `/main/bookings/abc` | 999999: *This booking doesn't exist* with a way back, no retry button; abc: goes back to the list | |
| BD-10 | Sign in as the view-only user (mock: `receptionist@odel.com`; real API: a role with only `Booking.View`) | Details open; no *End session*; sidebar shows Bookings and Payment reviews | |
| BD-11 | Arabic + dark mode, then 375px | RTL; the long date, amounts and the back arrow read correctly; the booking number and phone stay left-to-right; no horizontal scroll; items stack their duration under the name | |
| BD-12 | **Real API:** the booking's `startAt` has no offset | The shown time equals the salon (Cairo) time whatever the browser's time zone (try changing the OS time zone) | |

### Payment reviews (`/main/bookings/payment-reviews`)
| ID | Steps | Expected | Result |
|---|---|---|---|
| PR-01 | Open **Payment reviews** | First branch, *To review* with 5 cards (mock); tabs show 5 / 2 / 1; *Review time 30 min* and *Updated …* are shown | |
| PR-02 | Look at the waiting times | *Waiting N min*; the two late ones also have a red edge and a **Late** badge; the soonest-starting card is first | |
| PR-03 | Click a screenshot | Opens large with *#id · EGP … due · method*; scrolls inside if tall; Escape, the backdrop and the close button close it; focus returns to the screenshot button | |
| PR-04 | Compare the amount due with the screenshot of the card whose proof is short (mock: the VIP *Classic shave* one) | The image shows less than the amount due → reject it | |
| PR-05 | **Reject** with an empty reason, then with spaces only | *Write the reason…* and nothing is sent | |
| PR-06 | **Reject** with a 500-character reason, then try to type or paste more | Counter reaches 500/500 and stops; the request goes through | |
| PR-07 | **Reject** with a real reason | Toast *Booking rejected*, the card leaves *To review*, *Rejected today* count +1; in Bookings the booking is *Rejected*; the barber's upcoming count in Attendance drops | |
| PR-08 | **Approve** → read the dialog → confirm | The dialog repeats amount and method; toast *Booking approved*; card moves to *Approved today*; in Bookings the booking is *Confirmed* | |
| PR-09 | While a save is slow (DevTools → throttle), watch the cards | Only that card's buttons are locked; others still work | |
| PR-10 | Let an unreviewed booking pass its start time (or approve it in another tab first), then approve it here | A 409 explains; the queue reloads without it | |
| PR-11 | Leave the page open | The queue refreshes by itself about every minute (watch Network) and when you come back to the tab; *Updated …* changes; the cards don't flash; unplug the network: no error banner appears for background refreshes | |
| PR-12 | Press **Refresh** | The icon spins while it loads; the cards stay on screen | |
| PR-13 | Switch to *Approved today* / *Rejected today* | Cards show the booking status, no waiting time and no buttons; empty tabs say so | |
| PR-14 | Switch branch | Old cards and counts go at once; the other branch's queue loads | |
| PR-15 | The view-only user (mock: `receptionist@odel.com`) — `Booking.View` but not `Booking.Review` | Queue and screenshots visible; no Approve / Reject buttons | |
| PR-16 | Screen reader / keyboard | Tabs ↔ panel; each button is named with the booking (*Approve booking #489*); the screenshot button and image have text; the live region says *Showing N of M payments* after a load; both dialogs trap focus and Escape closes them | |
| PR-17 | Arabic + dark mode, then 375px | RTL; cards stack (screenshot above the facts), buttons share the width; amounts and phones read correctly | |
| PR-18 | **Real API:** the screenshot URL | Loads directly in the `<img>` (public URL); *Open original* opens it in a new tab | |
| PR-19 | Open *Rejected today* (or page 2), go to another page, come back to **Payment reviews** | Starts on *To review*, page 1; the branch you chose is kept; cards of the other tab don't flash | |

### Branches
| ID | Steps | Expected | Result |
|---|---|---|---|
| BR-01 | Create: names, address, phone, map URL, service modes (regular/VIP/home), working hours | Validation per field; whitespace-only names rejected; saved; opens details | |
| BR-02 | Working hours: closed day, open day, closing earlier than opening (treated as an overnight shift and flagged as such), and **same open/close time** | Overnight is labelled on the details page; **note exactly what is accepted for equal times** (decision D13) | |
| BR-03 | Details page: info, booking types, working hours, record dates, map | Correct; a branch **without** a map URL (create one with an empty map field) saves and shows the "no map" message, not a broken link | |
| BR-04 | Edit, toggle visibility, delete | Works; list refreshes on return | |
| BR-05 | Cards view: search, visibility filter, pagination | S-cases pass | |
| BR-06 | Payment methods: fill InstaPay (max 100) and a wallet (`+201…` / `01…`), save, open details | Both shown (left-to-right); an invalid wallet or 101-char InstaPay blocks the save with an inline error | |
| BR-07 | Edit a branch, clear both payment fields, save | Details show "Not enabled" for both; on the **real API** the request carries explicit `null` | |

### Services
| ID | Steps | Expected | Result |
|---|---|---|---|
| SV-01 | Create with prices in both branches (regular/VIP/home) | Saved; table shows the prices | |
| SV-02 | Edit prices and per-branch availability | Saved | |
| SV-03 | Bulk: copy prices between branches, adjust by % (preview shows before/after), bulk activate/deactivate | Each shows a result toast and the list refreshes; an invalid percentage is rejected inline | |
| SV-04 | Delete a service used by a package/offer | Server error shown clearly, nothing broken | |
| SV-05 | Page size and filters (branch, active, home) | 20 rows per page; filters correct | |

### Packages
| ID | Steps | Expected | Result |
|---|---|---|---|
| P-01 | Create: pick services with the picker, set prices | Saved; branch can't be changed on edit | |
| P-02 | Validation: blank/over-long names; prices checked against the selected services' totals (regular / VIP / home) | Inline errors explain each rule | |
| P-03 | Branch selector, toggle, delete | Works | |

### Offers
| ID | Steps | Expected | Result |
|---|---|---|---|
| O-01 | Create with banner image, dates, max bookings | Saved; image shown | |
| O-02 | Status tabs and their counts (Active, Scheduled, Ended, Limit reached, Stopped) | Counts match the rows in each tab | |
| O-03 | Stop / resume | Correct toast for each, tab counts move | |
| O-04 | Invalid dates (end before start); image over 5 MB or not jpg/png/webp | Inline errors | |
| O-05 | **Edit an offer on the real API** | Update succeeds (watch for a 400 mentioning `Id` — finding S5-05) | |
| O-06 | Screen reader (optional): results announced after load | Polite announcement | |

### Users
| ID | Steps | Expected | Result |
|---|---|---|---|
| U-01 | Create: weak password, mismatching confirmation, bad email, bad phone | Inline errors; policy text clear | |
| U-02 | Create valid; sign in as that user | Works with the assigned role's permissions | |
| U-03 | Edit with and without "change password" | Password optional unless the switch is on | |
| U-04 | Your own row | Can't delete/deactivate yourself (locked) | |
| U-05 | Filters (role, status) + search | Correct (API uses `RoleId`, `Status`, `Search`) | |
| U-06 | Open edit on user A then quickly on user B (throttled network) | Drawer ends on B's data, never A's | |

### Roles
| ID | Steps | Expected | Result |
|---|---|---|---|
| R-01 | Create, rename (whitespace-only rejected), delete a role; also try deleting a role that still has users | Works; note what the API answers for a role in use and that the message is readable | |
| R-02 | Role details page | Permission matrix loads (API field `modules`); counts per module correct; labels translated in AR | |
| R-03 | Toggle permissions, save, discard | Dirty state shown; save persists; reload shows the saved state | |
| R-04 | Edit **your own** role's permissions | Session refreshes: sidebar/buttons update without logging in again | |
| R-05 | Create a limited role (e.g. only `User.View`) and a user with it | Used for section P | |
| R-06 | Role list shows the user count and the permission count per role | Correct | |

## P. Permissions (use the limited user from R-05)

| ID | Steps | Expected | Result |
|---|---|---|---|
| P-10 | Sidebar | Only sections the role can view | |
| P-11 | Paste a URL of a section without permission, and `…/new`, `…/:id/edit` | *No access* page, no data request fired | |
| P-12 | A list the user can view but not change | No Create / Edit / Delete / toggle controls | |
| P-13 | Give the role only `View`, only `Create`, only `Edit`, only `Delete` one by one and re-check a module | Each button appears only with its own permission (status toggles follow `Edit` except Chairs, which has `ToggleStatus`) | |
| P-14 | Remove a permission from the role while that user is signed in, then refresh/refresh-token | Access is removed after the next refresh | |

## V. Production-build checks (Vercel deployment)

| ID | Steps | Expected | Result |
|---|---|---|---|
| V-01 | Log in with any email + a random 6-char password | **Fails** (the mock "any email works" login must not exist) | |
| V-02 | Open `/main/design-system` | 404 / not routed | |
| V-03 | DevTools → Sources → search for `Nasr City` or `Chair not found` | Not found | |
| V-04 | Hard refresh and deep links (`/main/roles/1`) | Page loads (rewrite to `index.html`) | |
| V-05 | Console on every page you visited | No errors or warnings from the app | |

## Reporting template

```
ID:        e.g. B-05
Env:       Vercel prod / npm start · browser · language · account
What I did:
Expected:
Actual:
Network:   METHOD URL → status, response body (if relevant)
Console:   error text (if any)
Screenshot: attached
```
