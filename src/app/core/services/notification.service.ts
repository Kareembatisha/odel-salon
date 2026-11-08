import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

export type NotifSeverity = "success" | "info" | "warn" | "error" | "secondary" | "contrast";

export interface NotifOptions {
  life?: number;
  sticky?: boolean;
  closable?: boolean;
}

/** Internal shape — mirrors PrimeNG Message without importing it here */
export interface ToastMessage {
  severity: NotifSeverity;
  summary: string;
  detail?: string;
  life?: number;
  sticky?: boolean;
  closable?: boolean;
}

/**
 * NotificationService
 *
 * Zero PrimeNG imports — emits plain ToastMessage objects on message$.
 * AppToast (component-level bridge) subscribes and forwards to MessageService.
 *
 * Architecture:
 *   NotificationService (root) → Subject<ToastMessage>
 *   AppToast (component)       → subscribes → MessageService (component-level)
 *   <p-toast />                → listens to its local MessageService
 *
 * This three-layer split avoids NG0200 / NG0201 injector errors.
 */
@Injectable({ providedIn: "root" })
export class NotificationService {
  readonly message$ = new Subject<ToastMessage>();

  success(summary: string, detail?: string, opts?: NotifOptions): void {
    this._emit("success", summary, detail, opts);
  }

  error(summary: string, detail?: string, opts?: NotifOptions): void {
    this._emit("error", summary, detail, { life: 6000, ...opts });
  }

  warning(summary: string, detail?: string, opts?: NotifOptions): void {
    this._emit("warn", summary, detail, opts);
  }

  info(summary: string, detail?: string, opts?: NotifOptions): void {
    this._emit("info", summary, detail, opts);
  }

  show(severity: NotifSeverity, summary: string, detail?: string, opts?: NotifOptions): void {
    this._emit(severity, summary, detail, opts);
  }

  clear(): void {
    this.message$.next({ severity: "info", summary: "__clear__", life: 0 });
  }

  private _emit(
    severity: NotifSeverity,
    summary: string,
    detail?: string,
    opts?: NotifOptions,
  ): void {
    this.message$.next({
      severity,
      summary,
      detail,
      life: opts?.life ?? 4000,
      sticky: opts?.sticky ?? false,
      closable: opts?.closable ?? true,
    });
  }
}
