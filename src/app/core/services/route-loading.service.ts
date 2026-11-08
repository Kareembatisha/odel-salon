import { Injectable, signal } from "@angular/core";

/**
 * RouteLoadingService
 * Central signal-based store for navigation loading state.
 * Wire in layout components via Router.events.
 */
@Injectable({ providedIn: "root" })
export class RouteLoadingService {
  readonly isLoading = signal(false);
  readonly progress = signal(0);

  private _timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.isLoading.set(true);
    this.progress.set(10);
    this._simulateProgress();
  }

  finish(to = 100): void {
    this._clearTimer();
    this.progress.set(to);
    setTimeout(() => {
      this.isLoading.set(false);
      this.progress.set(0);
    }, 300);
  }

  private _simulateProgress(): void {
    this._clearTimer();
    this._timer = setInterval(() => {
      const current = this.progress();
      if (current < 90) {
        const step = Math.random() * 8 + 2;
        this.progress.set(Math.min(current + step, 90));
      } else {
        this._clearTimer();
      }
    }, 250);
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
