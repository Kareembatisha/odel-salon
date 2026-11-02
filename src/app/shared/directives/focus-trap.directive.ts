import { Directive, ElementRef, HostListener, OnDestroy, afterNextRender, inject, input, output } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Open traps, oldest first. Only the topmost one reacts to Tab / Escape. */
const openTraps: FocusTrapDirective[] = [];

/**
 * FocusTrap — makes a dialog behave like a modal for keyboard users.
 *
 *  - On open: remembers the element that had focus (the "opener") and moves focus
 *    inside (to `appFocusTrapInitial` if it matches, else the first focusable, else the panel).
 *  - Tab / Shift+Tab cycle inside the panel; if focus is somehow outside it, Tab pulls it back in.
 *  - Escape closes it from ANYWHERE on the page (listener is on the document, not the panel),
 *    by emitting `appFocusTrapEscape`; the owner decides what "close" means.
 *  - On destroy: focus returns to the opener. If the opener is gone (e.g. its table row was
 *    re-rendered after a save), focus goes to the page's main content instead of falling to <body>.
 *
 *   <aside appFocusTrap appFocusTrapInitial="input, select" (appFocusTrapEscape)="close()">…</aside>
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
  host: { tabindex: '-1' },
})
export class FocusTrapDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** CSS selector of the preferred element to focus first. */
  readonly initial = input<string>('', { alias: 'appFocusTrapInitial' });
  readonly escaped = output<void>({ alias: 'appFocusTrapEscape' });

  private readonly opener = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

  constructor() {
    openTraps.push(this);
    afterNextRender(() => this.focusInitial());
  }

  ngOnDestroy(): void {
    const i = openTraps.indexOf(this);
    if (i >= 0) openTraps.splice(i, 1);
    // Wait a tick so the dialog's DOM is gone before restoring focus.
    setTimeout(() => this.restoreFocus());
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (openTraps[openTraps.length - 1] !== this) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.escaped.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = this.focusable();
    if (!items.length) {
      event.preventDefault();
      this.host.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && this.host.contains(active) && active !== this.host;

    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.closest('[hidden], [aria-hidden="true"]'),
    );
  }

  private focusInitial(): void {
    const preferred = this.initial() ? this.host.querySelector<HTMLElement>(this.initial()) : null;
    (preferred ?? this.focusable()[0] ?? this.host).focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    const target =
      this.opener && this.opener.isConnected && this.opener !== document.body
        ? this.opener
        : document.getElementById('main-content');
    target?.focus({ preventScroll: true });
  }
}
