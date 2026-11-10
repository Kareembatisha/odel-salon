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
| A-10 | Forgot password → code → reset flow | Each step shows its toast; new password works; old doesn't | |
| A-11 | Profile: change name/phone/image; change password | Saved; header name/avatar update immediately | |
| A-12 | Dashboard | **Expected on the live API: error state** (no `/dashboard/summary` endpoint — finding S5-01). Confirm it doesn't break navigation | |

## L. Layout, language, responsive, keyboard

| ID | Steps | Expected | Result |
|---|---|---|---|
| L-01 | Switch EN ⇄ AR on every list and every form | Everything translated, direction flips, no overlapping/clipped text, icons/chevrons mirror correctly | |
| L-02 | Widths 360 px, 768 px, 1280 px on Users, Chairs, Services, Branch form | Sidebar collapses, tables scroll or reflow, drawers fit, no horizontal page scroll | |
| L-03 | Dark/theme or brand toggles if present | Contrast OK, nothing unreadable | |
| L-04 | Keyboard only: Tab through a list, open a drawer with Enter, press **Esc** | Visible focus ring, focus stays inside the drawer, Esc closes, focus returns to the button that opened it | |
| L-05 | Open a confirm dialog and press Esc / click the backdrop | Cancels, nothing deleted | |
| L-06 | Sidebar and breadcrumbs | Active item highlighted; breadcrumb text correct on list, details and edit pages | |
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
| S-08 | Delete the **only row on the last page** | Table moves to the previous page, not an empty page (finding S5-04 for Users/Roles/Barbers) | |
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
| B-02 | Invalid phone (letters, wrong prefix, too short); image over 5 MB or not jpg/png/webp | Inline error, nothing sent | |
| B-03 | Edit: change image, then remove image | Image updates / is removed | |
| B-04 | Select 3 rows, bulk delete; then delete one row while others are ticked | Bulk works; the **other ticks stay** after a single delete | |
| B-05 | **Edit a barber on the real API** | Update succeeds (watch for a 400 mentioning `Id` — finding S5-05) | |
| B-06 | Branch filter and toggle | Works; toggle disabled while a request runs | |

### Branches
| ID | Steps | Expected | Result |
|---|---|---|---|
| BR-01 | Create: names, address, phone, map URL, service modes (regular/VIP/home), working hours | Validation per field; whitespace-only names rejected; saved; opens details | |
| BR-02 | Working hours: closed day, open day, closing earlier than opening (treated as an overnight shift and flagged as such), and **same open/close time** | Overnight is labelled on the details page; **note exactly what is accepted for equal times** (decision D13) | |
| BR-03 | Details page: info, booking types, working hours, record dates, map | Correct; a branch **without** a map URL shows the "no map" message, not a broken link | |
| BR-04 | Edit, toggle visibility, delete | Works; list refreshes on return | |
| BR-05 | Cards view: search, visibility filter, pagination | S-cases pass | |

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
