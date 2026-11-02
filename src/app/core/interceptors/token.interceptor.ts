import { HttpInterceptorFn, HttpRequest } from "@angular/common/http";

const TOKEN_KEY = "odl_access_token";

const PUBLIC_URL_SEGMENTS: string[] = [
  "/auth/login",
  "/auth/password/forgot",
  "/auth/password/verify",
  "/auth/password/reset",
  "/auth/refresh-token",
  // Public product-verification page (QR-code scan) — reachable by anyone,
  // logged in or not, so it must never carry the current user's token.
  "/products/public/",
];

function isPublicRequest(req: HttpRequest<unknown>): boolean {
  return PUBLIC_URL_SEGMENTS.some((segment) => req.url.includes(segment));
}

/**
 * tokenInterceptor
 * Attaches Bearer token to every non-public HTTP request.
 */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (isPublicRequest(req)) return next(req);

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return next(req);

  const authedReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(authedReq);
};
