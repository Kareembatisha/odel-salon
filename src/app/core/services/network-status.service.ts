// network-status.service.ts
//
// Previously the app only ever checked `navigator.onLine` reactively, at the
// moment an HTTP request failed (see error.interceptor.ts `handleError`).
// If the user lost their connection while just sitting on a page with no
// pending request, they got zero feedback — no banner, no toast, nothing —
// until they next tried to do something. This listens proactively so the
// user finds out immediately, and gets a "you're back online" confirmation
// too.
//
// Limitation (same one noted in the interceptor): `navigator.onLine` only
// reflects whether the device has *a* network interface up, not whether it
// can actually reach this app's backend (e.g. it stays `true` on a captive
// portal with no real internet). This is a best-effort signal, not a
// guarantee.
import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import { NotificationService } from "./notification.service";

@Injectable({ providedIn: "root" })
export class NetworkStatusService implements OnDestroy {
  private readonly notify = inject(NotificationService);

  readonly isOnline = signal(typeof navigator === "undefined" ? true : navigator.onLine);

  private readonly onlineHandler = () => this.handleOnline();
  private readonly offlineHandler = () => this.handleOffline();
  private started = false;

  /**
   * Starts listening. Call once, near app bootstrap (e.g. from AppToast's
   * ngOnInit, which is already guaranteed to run once per layout mount) —
   * deliberately not auto-started in the constructor so it's explicit
   * where in the app's lifecycle this begins, and easy to unit test in
   * isolation without touching real `window` listeners.
   */
  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
  }

  ngOnDestroy(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("online", this.onlineHandler);
    window.removeEventListener("offline", this.offlineHandler);
  }

  private handleOnline(): void {
    const wasOffline = !this.isOnline();
    this.isOnline.set(true);
    if (wasOffline) {
      this.notify.success("NETWORK_STATUS.BACK_ONLINE");
    }
  }

  private handleOffline(): void {
    this.isOnline.set(false);
    this.notify.warning("NETWORK_STATUS.OFFLINE", undefined, { sticky: true });
  }
}
