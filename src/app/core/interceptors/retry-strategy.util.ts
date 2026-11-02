// retry-strategy.util.ts
//
// A deliberately narrow, opt-in retry helper — NOT wired into the global
// error interceptor's default pipe, because blindly retrying every request
// is dangerous: retrying a POST/PUT/PATCH/DELETE that already reached the
// server (but whose response was lost) can duplicate side effects (create
// the same record twice, double-charge, etc.). Angular's HttpClient/RxJS
// have no built-in way to know whether a failed request actually executed
// server-side or not, so the only safe default is: only ever auto-retry
// requests that are provably idempotent by HTTP semantics — GET.
//
// Usage (opt-in, per call site — NOT applied globally):
//   this.http.get(url).pipe(withRetryStrategy())
//
// or, if wired into the interceptor pipe conditionally:
//   req.method === 'GET' ? next(req).pipe(withRetryStrategy()) : next(req)

import { HttpErrorResponse } from "@angular/common/http";
import { Observable, timer } from "rxjs";
import { retry } from "rxjs";

const RETRYABLE_STATUS_CODES = new Set([0, 408, 429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 500;

/**
 * RxJS operator: retries up to `MAX_RETRY_ATTEMPTS` times, only for status
 * codes that represent a transient/infrastructure problem rather than a
 * real client error, with exponential backoff between attempts.
 *
 * For 429 specifically, honors `Retry-After` (seconds or HTTP-date) instead
 * of the exponential backoff when the header is present, since the server
 * is telling us exactly how long to wait.
 */
export function withRetryStrategy<T>() {
  return (source: Observable<T>): Observable<T> =>
    source.pipe(
      retry({
        count: MAX_RETRY_ATTEMPTS,
        delay: (error: unknown, retryCount: number) => {
          if (!(error instanceof HttpErrorResponse) || !RETRYABLE_STATUS_CODES.has(error.status)) {
            // Not a retryable error (e.g. 400/401/404/409) — rethrow
            // immediately instead of waiting, so `retry()` gives up now.
            throw error;
          }

          if (error.status === 429) {
            const retryAfterMs = parseRetryAfterMs(error.headers?.get?.("Retry-After") ?? null);
            if (retryAfterMs != null) {
              return timer(retryAfterMs);
            }
          }

          // Exponential backoff: 500ms, 1000ms, ...
          return timer(BASE_BACKOFF_MS * Math.pow(2, retryCount - 1));
        },
      }),
    );
}

/**
 * `Retry-After` can be either a number of seconds ("120") or an HTTP-date
 * ("Wed, 21 Oct 2026 07:28:00 GMT") per RFC 7231 §7.1.3 — this project's
 * interceptor previously only ever displayed the raw header value, which
 * would show garbled text to the user for the HTTP-date form. Shared here so
 * both the interceptor's toast copy and this retry operator parse it the
 * same, correct way.
 */
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const asSeconds = Number(headerValue);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const deltaMs = asDate - Date.now();
    return deltaMs > 0 ? deltaMs : 0;
  }

  return null;
}
