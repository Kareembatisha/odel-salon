import { Injectable, inject, signal, computed } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLang = 'en' | 'ar';

const STORAGE_KEY = 'odl_lang';
const VALID_LANGS: AppLang[] = ['en', 'ar'];

export function readStoredLang(): AppLang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (VALID_LANGS as string[]).includes(stored ?? '') ? (stored as AppLang) : 'en';
}

/**
 * State-management pattern used across the app: a service holding
 * private writable signal(s) + public readonly signal(s)/computed().
 * No NgRx/NGXS — signals are the single source of truth.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);

  private readonly _currentLang = signal<AppLang>(readStoredLang());

  readonly currentLang = this._currentLang.asReadonly();
  readonly isRtl = computed(() => this._currentLang() === 'ar');
  readonly direction = computed<'ltr' | 'rtl'>(() => (this.isRtl() ? 'rtl' : 'ltr'));

  /** User-initiated switch: updates state, persists, and applies. */
  setLang(lang: AppLang): void {
    this._currentLang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    this.applyLang(lang);
  }

  /**
   * Applies a language to ngx-translate and the document without touching
   * persisted state — used on bootstrap to sync <html lang>/[dir] with
   * whatever language was already restored from localStorage.
   */
  applyLang(lang: AppLang): void {
    this.translate.use(lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }
}
