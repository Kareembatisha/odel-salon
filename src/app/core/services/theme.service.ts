import { Injectable, computed, effect, signal } from "@angular/core";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "odl_theme";

function readStoredTheme(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * ThemeService — light/dark mode.
 *
 * Light is the default (no OS-preference sniffing: the product decision is
 * "light unless the person chooses dark"). The choice is persisted and applied
 * as <html data-theme>, which both the SCSS tokens (CSS variables) and the
 * PrimeNG preset (darkModeSelector) key off. index.html applies the persisted
 * value before Angular boots, so there is no flash of the wrong theme.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(readStoredTheme());

  readonly mode = this._mode.asReadonly();
  readonly isDark = computed(() => this._mode() === "dark");

  constructor() {
    effect(() => this.apply(this._mode()));
    // Enable colour transitions only after first paint, so the initial theme
    // never animates in from the wrong palette.
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => document.documentElement.classList.add("odl-theme-ready"));
    }
  }

  setTheme(mode: ThemeMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage unavailable (private mode) — theme still applies for this session */
    }
  }

  toggle(): void {
    this.setTheme(this.isDark() ? "light" : "dark");
  }

  private apply(mode: ThemeMode): void {
    document.documentElement.setAttribute("data-theme", mode);
  }
}
