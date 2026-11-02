// error-logging.service.ts
//
// Today: structured console logging only — grepped package.json, there is
// NO monitoring/error-tracking tool installed (Sentry, LogRocket, Datadog,
// Bugsnag, etc.), so in production the team currently has zero visibility
// into errors beyond what a user happens to report manually.
//
// This service is a single choke point for BOTH HTTP errors (from
// error.interceptor.ts) and uncaught JS errors (from GlobalErrorHandler),
// so wiring in a real monitoring SDK later is a one-file change instead of
// hunting down every place errors are currently only console.error'd.
//
// Deciding WHICH tool to adopt is a team/infra decision, not something to
// invent here — this only defines the shape of what gets logged and keeps
// PII/secrets out of it.
import { Injectable } from "@angular/core";

export interface HttpErrorLogContext {
  kind: "http";
  status: number;
  url: string;
  method: string;
  message: string;
  timestamp: string;
}

export interface JsErrorLogContext {
  kind: "js";
  message: string;
  stack?: string;
  timestamp: string;
}

export type ErrorLogContext = HttpErrorLogContext | JsErrorLogContext;

@Injectable({ providedIn: "root" })
export class ErrorLoggingService {
  logHttpError(params: Omit<HttpErrorLogContext, "kind" | "timestamp">): void {
    this.log({ kind: "http", timestamp: new Date().toISOString(), ...params });
  }

  logJsError(params: Omit<JsErrorLogContext, "kind" | "timestamp">): void {
    this.log({ kind: "js", timestamp: new Date().toISOString(), ...params });
  }

  private log(context: ErrorLogContext): void {
    // Deliberately NOT logging request/response bodies, headers, or
    // tokens here — only status/url/method/message/stack. Request bodies
    // can contain PII (names, national IDs, uploaded document contents)
    // and headers can contain the Authorization bearer token; neither
    // should ever end up in logs, console-based or remote.
    //
    // TODO(monitoring): once a real tool is adopted, forward `context`
    // to it here (e.g. `Sentry.captureException` / `Sentry.captureMessage`)
    // instead of / in addition to the console line below.
    console.error("[ErrorLoggingService]", context);
  }
}
