// global-error-handler.ts
//
// Angular's default ErrorHandler just console.errors an uncaught error and
// leaves change detection wherever it broke — for a template error thrown
// mid-render (e.g. `s.company.name` when `company` is null), that's often
// the *entire* page's view tree, since Angular detaches the branch that
// threw and never finishes the render pass. The user is left looking at a
// blank/black screen with no indication anything went wrong, and no way
// out except a manual refresh.
//
// This is not a substitute for fixing the actual bug (null-safety in
// templates/models — see the null-safety conventions in the README
// fix) — it's a last-resort net so a *single bad field in one API
// response* can only ever break isolated to a toast instead of a fully
// dead page.
import { ErrorHandler, Injectable, Injector, inject } from "@angular/core";
import { NotificationService } from "./notification.service";
import { ErrorLoggingService } from "./error-logging.service";

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Lazy-injected (not via constructor) to sidestep the same NG0200
  // circular-dependency issue documented on MessageService/AppToast —
  // ErrorHandler is constructed very early in the app's DI graph.
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    // Always log the real error for devtools/telemetry — never swallow it silently.
    console.error("Unhandled application error:", error);

    try {
      const logging = this.injector.get(ErrorLoggingService);
      logging.logJsError({
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } catch {
      // Same reasoning as the NotificationService try/catch below — don't
      // risk a second uncaught error if logging itself can't be constructed.
    }

    try {
      const notify = this.injector.get(NotificationService);
      notify.error("ERRORS.UNKNOWN");
    } catch {
      // NotificationService itself isn't constructible (e.g. the crash
      // happened before the app finished bootstrapping) — nothing more
      // we can safely do here without risking a second uncaught error.
    }
  }
}
