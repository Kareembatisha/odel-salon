import { Observable, delay, of, throwError } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";

/** Simulated network latency applied to every mock response (ms). */
export const MOCK_DELAY_MS = 450;

/** `200` (or `statusCode`) success envelope. */
export function mockReply<T>(
  data: T,
  message = "Operation completed successfully",
  statusCode = 200,
): Observable<ApiResponse<T>> {
  return of<ApiResponse<T>>({
    status: true,
    statusCode,
    message,
    errors: null,
    meta: null,
    data,
  }).pipe(delay(MOCK_DELAY_MS));
}

/** A paged `200` envelope (`meta` carries the paging and `additionalData`). */
export function mockReplyWithMeta<T>(data: T, meta: PaginationMeta): Observable<ApiResponse<T>> {
  return of<ApiResponse<T>>({
    status: true,
    statusCode: 200,
    message: "Operation completed successfully",
    errors: null,
    meta,
    data,
  }).pipe(delay(MOCK_DELAY_MS));
}

/** A `status: false` 404 body — how the mock answers READS for a missing record (no toast). */
export function mockNotFoundBody<T>(message: string): Observable<ApiResponse<T>> {
  return of<ApiResponse<T>>({
    status: false,
    statusCode: 404,
    message,
    errors: null,
    meta: null,
    data: null,
  }).pipe(delay(MOCK_DELAY_MS));
}

/** Mock repositories skip the HTTP interceptors, so show the toast the interceptor would. */
export function mockFail(
  notify: NotificationService,
  message: string,
  statusCode: number,
): Observable<never> {
  notify.warning(message);
  return throwError(() => Object.assign(new Error(message), { status: statusCode })).pipe(
    delay(MOCK_DELAY_MS),
  ) as Observable<never>;
}

/** 400 — same shape as the interceptor's validation toast: field label + message. */
export function mockInvalid(
  notify: NotificationService,
  field: string,
  messageKey: string,
): Observable<never> {
  notify.warning(`VALIDATION_FIELDS.${field}`, messageKey);
  return throwError(() => Object.assign(new Error("Validation failed"), { status: 400 })).pipe(
    delay(MOCK_DELAY_MS),
  ) as Observable<never>;
}
