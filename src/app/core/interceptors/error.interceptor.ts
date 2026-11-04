import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpStatusCode,
} from "@angular/common/http";
import { inject, Injector, runInInjectionContext } from "@angular/core";
import { Router } from "@angular/router";
import { TranslateService } from "@ngx-translate/core";
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  filter,
  finalize,
  race,
  switchMap,
  take,
  throwError,
  timeout,
  TimeoutError,
} from "rxjs";

import { NotificationService } from "../services/notification.service";
import { ErrorLoggingService } from "../services/error-logging.service";
import { AuthApiRepository } from "../../modules/auth/repository/auth-api.repository";
import { AuthService } from "../../modules/auth/service/auth.service";
import { ApiErrors } from "../../shared/model/api_response.model";
import { parseRetryAfterMs } from "./retry-strategy.util";

const REFRESH_TOKEN_KEY = "odl_refresh_token";

// URL segment used to detect the refresh-token call itself, so we never
// try to "refresh the refresh" and loop forever.
const REFRESH_URL_SEGMENT = "/auth/refresh-token";

/**
 * Module-level (singleton) state shared across every request that flows
 * through this interceptor. A single in-flight refresh call is shared by
 * all requests that 401 concurrently, instead of firing one refresh call
 * per failed request.
 */
let isRefreshing = false;
const refreshedAccessToken$ = new BehaviorSubject<string | null>(null);
/**
 * Signals a failed refresh to any requests currently queued waiting for a
 * new token (see the "already refreshing" branch of handleUnauthorized).
 * Without this, refreshedAccessToken$.next(null) on failure was silently
 * filtered out by those waiters (they only look for non-null tokens), so
 * they hung forever instead of erroring out — the request that triggered
 * the refresh correctly got forceLogout()'d, but every other concurrent
 * 401'd request just sat in a perpetual loading state.
 */
const refreshFailed$ = new Subject<unknown>();

// No request was reliably timing out anywhere in the app before this —
// grepped for `timeout(`/`retry(` under core/ and found nothing. A stuck
// backend call (dead connection, black-holed proxy, etc.) would just spin
// the caller's loading state forever with no toast and no way out short of
// a manual refresh. 30s is generous enough for slow list/report endpoints
// while still giving the user *some* feedback instead of an infinite spinner.
const DEFAULT_REQUEST_TIMEOUT_MS = 100_000;

// Bursty failures (e.g. a dashboard firing 5 parallel widget calls while the
// backend is down) used to stack one identical toast per failed request.
// This is a light in-memory de-dupe: the same summary text is suppressed if
// it was already shown within the window below. Not per-user-visible state,
// just a UX guard — fine to live as module-level like the refresh state above.
const TOAST_DEDUPE_WINDOW_MS = 3000;
const recentToastKeys = new Map<string, number>();

function notifyDeduped(
  notify: NotificationService,
  severity: "error" | "warning",
  summary: string,
): void {
  const now = Date.now();
  const lastShown = recentToastKeys.get(summary);
  if (lastShown != null && now - lastShown < TOAST_DEDUPE_WINDOW_MS) {
    return;
  }
  recentToastKeys.set(summary, now);
  notify[severity](summary);
}

/**
 * Global HTTP Error Interceptor
 *
 * - Handles all HTTP errors in one place.
 * - Uses lazy injection to avoid NG0200 circular dependency issues.
 * - Displays translated notifications.
 * - Applies a client-side request timeout, since nothing else in the app does.
 * - On 401 Unauthorized: silently refreshes the access token and retries
 *   the original request so the user notices nothing. Only if the refresh
 *   call itself fails does it warn the user and redirect to login.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  const router = inject(Router);

  return next(req).pipe(
    timeout(DEFAULT_REQUEST_TIMEOUT_MS),
    catchError((err: HttpErrorResponse | TimeoutError) => {
      const notify = runInInjectionContext(injector, () =>
        inject(NotificationService),
      );
      const logging = runInInjectionContext(injector, () =>
        inject(ErrorLoggingService),
      );
      const authService = runInInjectionContext(injector, () =>
        inject(AuthService),
      );

      // rxjs `timeout()` throws a TimeoutError, NOT an HttpErrorResponse —
      // it never actually reached the server, so none of the status-code
      // branches below apply. Normalize it to a status-0-shaped error so
      // callers downstream of this interceptor (components doing their own
      // catchError) still get *something* HttpErrorResponse-shaped instead
      // of a totally different error type they don't expect.
      if (err instanceof TimeoutError) {
        notifyDeduped(notify, "error", "ERRORS.TIMEOUT");
        logging.logHttpError({
          status: 0,
          url: req.url,
          method: req.method,
          message: "Client-side timeout",
        });
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              statusText: "Timeout",
              url: req.url,
            }),
        );
      }

      // Log every HTTP error centrally (status/url/method/message only —
      // never headers or body, see ErrorLoggingService) so there's at
      // least a structured console trail today, and a single place to
      // forward to a real monitoring tool once one is adopted. 401s are
      // still logged here even though they're often "normal" (expired
      // token) — the eventual monitoring tool is a better place to filter
      // noise than skipping logging altogether.
      logging.logHttpError({
        status: err.status,
        url: req.url,
        method: req.method,
        message: err.message,
      });

      if (err.status === HttpStatusCode.Unauthorized) {
        // The refresh-token endpoint itself returned 401 -> refresh token
        // is dead, nothing left to do but sign the user out.
        if (req.url.includes(REFRESH_URL_SEGMENT)) {
          isRefreshing = false;
          forceLogout(notify, router, authService);
          return throwError(() => err);
        }

        return runInInjectionContext(injector, () =>
          handleUnauthorized(req, next, notify, router, authService),
        );
      }

      const translate = runInInjectionContext(injector, () =>
        inject(TranslateService),
      );
      handleError(err, notify, router, translate);
      return throwError(() => err);
    }),
  );
};

/**
 * Attempts a silent token refresh and retries the original request.
 * If a refresh is already in flight, the request waits for it instead of
 * triggering a second refresh call.
 */
function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  notify: NotificationService,
  router: Router,
  authService: AuthService,
): Observable<HttpEvent<unknown>> {
  const authRepository = inject(AuthApiRepository);

  if (!isRefreshing) {
    isRefreshing = true;
    refreshedAccessToken$.next(null);

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      isRefreshing = false;
      forceLogout(notify, router, authService);
      const err = new HttpErrorResponse({
        status: HttpStatusCode.Unauthorized,
      });
      refreshFailed$.next(err);
      return throwError(() => err);
    }

    return authRepository.refreshToken({ refreshToken }).pipe(
      switchMap((res) => {
        const newAccessToken = res.data?.accessToken;
        if (!newAccessToken) {
          throw new Error("Refresh token response missing accessToken");
        }

        // Keeps localStorage + AuthService's signals (role/permissions
        // included) in sync in one place — see applyRefreshedSession()'s
        // doc comment for why this matters here specifically.
        authService.applyRefreshedSession(
          newAccessToken,
          res.data?.refreshToken ?? null,
          res.data?.role ?? "",
          res.data?.permissions ?? [],
        );
        refreshedAccessToken$.next(newAccessToken);

        return next(cloneWithToken(req, newAccessToken));
      }),
      catchError((refreshErr) => {
        // Refresh call failed (expired/invalid refresh token, network, etc.)
        // -> warn the user, send them back to login, and unblock any
        // other requests that were queued waiting for this same refresh.
        forceLogout(notify, router, authService);
        refreshFailed$.next(refreshErr);
        return throwError(() => refreshErr);
      }),
      finalize(() => {
        isRefreshing = false;
      }),
    );
  }

  // A refresh is already in progress: wait for it to finish, then retry
  // this request with the freshly issued access token — or, if that
  // in-flight refresh ends up failing, propagate the failure here too
  // instead of waiting forever for a token that will never arrive.
  return race(
    refreshedAccessToken$.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap((token) => next(cloneWithToken(req, token))),
    ),
    refreshFailed$.pipe(
      take(1),
      switchMap((err) => throwError(() => err)),
    ),
  );
}

function cloneWithToken(
  req: HttpRequest<unknown>,
  accessToken: string,
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Refresh failed (or no refresh token available) -> clear session, warn, redirect. */
function forceLogout(
  notify: NotificationService,
  router: Router,
  authService: AuthService,
): void {
  // Delegate to AuthService.clearSession() rather than removing the
  // localStorage keys directly here: this interceptor used to clear
  // localStorage but never touch AuthService's in-memory signals, so
  // isAuthenticated() stayed `true` in the *same tab* after a forced
  // logout — guestGuard would then treat the user as still authenticated
  // and immediately bounce them off the very /login page this redirect
  // just sent them to. Going through the service keeps every source of
  // auth state (localStorage + signals) consistent in one call, and still
  // fires the same `storage` event other tabs rely on for cross-tab sync.
  authService.clearSession();
  refreshedAccessToken$.next(null);

  notify.warning("ERRORS.SESSION_EXPIRED");
  router.navigate(["/login"]);
}

function handleError(
  err: HttpErrorResponse,
  notify: NotificationService,
  router: Router,
  translate: TranslateService,
): void {
  if (err.status === 0) {
    // `navigator.onLine` isn't a perfect signal (it can be true on a
    // captive portal or with a flaky connection), but it's enough to tell
    // "your device is offline" apart from "the backend/CORS/proxy is the
    // problem" instead of showing the same generic message for both, which
    // sends people down the wrong troubleshooting path.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      notifyDeduped(notify, "error", "ERRORS.OFFLINE");
    } else {
      notifyDeduped(notify, "error", "ERRORS.NETWORK");
    }
    return;
  }

  switch (err.status) {
    case HttpStatusCode.Forbidden:
      notifyDeduped(notify, "error", "ERRORS.FORBIDDEN");
      break;

    case HttpStatusCode.NotFound:
      notifyDeduped(notify, "warning", "ERRORS.NOT_FOUND");
      break;

    // Handle validation errors returned as 400 or 422
    case HttpStatusCode.BadRequest:
    case HttpStatusCode.UnprocessableEntity:
      handleValidationErrors(err, notify, translate);
      break;

    case HttpStatusCode.RequestTimeout:
      notifyDeduped(notify, "error", "ERRORS.TIMEOUT");
      break;

    case HttpStatusCode.Conflict:
      // e.g. two users editing/approving the same record at once, or a
      // duplicate-create race. Previously fell into the generic branch and
      // surfaced whatever raw string the backend happened to send.
      notifyDeduped(
        notify,
        "warning",
        extractMessage(err) ?? "ERRORS.CONFLICT",
      );
      break;

    case HttpStatusCode.PayloadTooLarge:
      // Reachable today: there is no client-side max-file-size check on
      // any upload (document tabs, employee/product attachments) — grepped
      // the whole app, none exists. This is the first user-facing signal
      // that a file was too big; ideally paired with a client-side check
      // before the request is even sent (see PR note in the upload dialog).
      notifyDeduped(notify, "warning", "ERRORS.FILE_TOO_LARGE");
      break;

    case HttpStatusCode.UnsupportedMediaType:
      notifyDeduped(notify, "warning", "ERRORS.UNSUPPORTED_FILE_TYPE");
      break;

    case HttpStatusCode.TooManyRequests: {
      // Surface Retry-After when the backend/gateway sends it, since "try
      // again in N seconds" is far more actionable than a bare "slow down".
      // NotificationService has no i18n-interpolation support (its API is
      // plain translation-key strings), so the seconds are appended as a
      // plain, untranslated detail string rather than smuggled into the key.
      const retryAfter = err.headers?.get?.("Retry-After");
      const now = Date.now();
      const lastShown = recentToastKeys.get("ERRORS.RATE_LIMITED");
      if (lastShown == null || now - lastShown >= TOAST_DEDUPE_WINDOW_MS) {
        recentToastKeys.set("ERRORS.RATE_LIMITED", now);
        // `Retry-After` can be seconds ("120") OR an HTTP-date
        // ("Wed, 21 Oct 2026 07:28:00 GMT") per RFC 7231 — previously the
        // raw header value was shown as-is, which produced a garbled
        // message for the date form (e.g. "Retry after Wed, 21 Oct... s").
        // `parseRetryAfterMs` normalizes both forms to a plain second count.
        const retryAfterMs = parseRetryAfterMs(retryAfter ?? null);
        const detail =
          retryAfterMs != null
            ? translate.instant("ERRORS.RETRY_AFTER", {
                seconds: Math.ceil(retryAfterMs / 1000),
              })
            : undefined;
        notify.warning("ERRORS.RATE_LIMITED", detail);
      }
      break;
    }

    case HttpStatusCode.BadGateway:
    case HttpStatusCode.ServiceUnavailable:
    case HttpStatusCode.GatewayTimeout:
      // Distinct from a generic 5xx: these mean the app server itself is
      // fine but something in front of it (proxy/gateway/upstream) isn't —
      // e.g. a deploy in progress. Same "server" message today, but kept
      // as its own case so this is the one spot to add a "we're deploying,
      // try again shortly" variant later without touching the 500 path.
      notifyDeduped(notify, "error", "ERRORS.SERVER");
      break;

    default:
      if (err.status >= 500) {
        notifyDeduped(notify, "error", "ERRORS.SERVER");
      } else {
        notifyDeduped(notify, "error", extractMessage(err) ?? "ERRORS.UNKNOWN");
      }
  }
}

/**
 * Safely pulls a human-readable message out of an HttpErrorResponse.
 *
 * `err.error?.message ?? err.message` (the old logic) breaks in two real
 * ways:
 *  1. If the response body isn't JSON — an nginx/gateway HTML error page for
 *     413/502, or plain text — `err.error` is that raw string, so
 *     `err.error?.message` is `undefined` and it silently falls through to
 *     Angular's own `err.message`, which looks like
 *     "Http failure response for https://.../api/x: 429 Too Many Requests" —
 *     a technical, untranslated string shown directly to end users.
 *  2. The moment any request uses `responseType: 'blob'` (file export /
 *     download — Reports module is the obvious next place this lands),
 *     `err.error` is a `Blob` instance, not parsed JSON, so
 *     `err.error?.message` is always `undefined` there too, with no
 *     fallback that actually reads the blob's text.
 *
 * This only returns a message when it's confident it's an actual
 * backend-authored string, otherwise returns null so the caller falls back
 * to a translated generic key instead of leaking a raw technical string.
 */
function extractMessage(err: HttpErrorResponse): string | null {
  const body: unknown = err.error;

  if (
    typeof body === "string" &&
    body.trim().length > 0 &&
    !body.trim().startsWith("<")
  ) {
    return body;
  }

  if (body && typeof body === "object" && !(body instanceof Blob)) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  // Blob bodies need to be read asynchronously (FileReader/`.text()`), which
  // doesn't fit this synchronous extractor. Rather than silently showing
  // nothing useful, callers that expect blob responses (report/file
  // downloads) should read `err.error.text()` themselves at the call site
  // where they already know the response is a blob — flagged here so this
  // isn't a silent trap for whoever adds the first blob download.
  return null;
}

/**
 * "AdditionalExpensesCurrency" -> "Additional Expenses Currency".
 * Backend field names come back PascalCase (sometimes camelCase); shown
 * raw they read like a variable name, not a form field, so this splits
 * them into normal, title-cased words for the toast.
 */
function humanizeFieldName(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * Field name for a validation toast: the translated `VALIDATION_FIELDS.<Field>`
 * label when we have one (the API only localizes messages, not field names),
 * otherwise the humanized field name.
 */
function fieldLabel(field: string, translate: TranslateService): string {
  const key = `VALIDATION_FIELDS.${field}`;
  const label = translate.instant(key);

  return label === key ? humanizeFieldName(field) : label;
}

function handleValidationErrors(
  err: HttpErrorResponse,
  notify: NotificationService,
  translate: TranslateService,
): void {
  const errors: ApiErrors | null = err.error?.errors ?? null;

  if (errors && Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, message]) => {
      // `ApiErrors` is typed as `Record<string, string>`, but some backend
      // validation frameworks (FluentValidation/Laravel-style) return an
      // array of messages per field instead of a single string, e.g.
      // `{ "email": ["required", "invalid format"] }`. The old code passed
      // that array straight into `notify.warning()`, which expects a
      // string — showing "[object Object]" or a raw comma-joined array to
      // the user. Normalize either shape to one readable string per field.
      const text = Array.isArray(message) ? message.join(", ") : message;
      if (text) {
        // Previously only `text` was shown (e.g. "The value '' is
        // invalid."), with no indication of which field it was about —
        // confusing on a multi-step form. Now the field name is the toast
        // summary and the backend message is the detail line, so it reads
        // like "Additional Expenses — The value '' is invalid."
        notify.warning(fieldLabel(field, translate), text);
      }
    });
    return;
  }

  notify.warning(extractMessage(err) ?? "ERRORS.VALIDATION");
}
