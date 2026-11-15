import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import { FocusTrapDirective } from "@shared/directives/focus-trap.directive";

/**
 * Lightbox for a payment-proof screenshot — the reviewer compares it with the amount due.
 *
 *   <app-proof-viewer [src]="url" title="Payment proof" caption="#489 · EGP 340 · InstaPay"
 *     alt="Payment proof of #489" closeLabel="Close" openLabel="Open original" (closed)="url = null" />
 *
 * Open while `src` is set. Texts are already translated by the caller (i18n-agnostic, like
 * `app-confirm-modal`). Escape and a click on the backdrop close it; focus is trapped inside and
 * returns to the opener. "Open original" shows only for a real web address (a `data:` image can't be
 * opened in a new tab).
 */
@Component({
  selector: "app-proof-viewer",
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    @if (src()) {
      <div class="backdrop" role="presentation" (click)="onBackdrop($event)">
        <div
          class="viewer"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          appFocusTrap
          appFocusTrapInitial="button"
          (appFocusTrapEscape)="closed.emit()"
        >
          <header class="viewer__head">
            <div class="viewer__text">
              <h2 class="viewer__title">{{ title() }}</h2>
              @if (caption()) {
                <p class="viewer__caption">{{ caption() }}</p>
              }
            </div>
            <button type="button" class="viewer__close" [attr.aria-label]="closeLabel()" (click)="closed.emit()">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </header>

          <div class="viewer__body">
            <img class="viewer__image" [src]="src()" [alt]="alt()" />
          </div>

          @if (canOpenOriginal()) {
            <a class="viewer__open" [href]="src()" target="_blank" rel="noopener noreferrer">
              {{ openLabel() }}<i class="pi pi-external-link" aria-hidden="true"></i>
            </a>
          }
        </div>
      </div>
    }
  `,
  styleUrl: "./proof-viewer.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProofViewerComponent {
  /** The image to show; `null` / empty keeps the viewer closed. */
  readonly src = input<string | null>(null);
  readonly alt = input<string>("");
  readonly title = input<string>("");
  /** One line under the title (booking, amount due, method). */
  readonly caption = input<string>("");
  readonly closeLabel = input<string>("Close");
  readonly openLabel = input<string>("Open original");

  readonly closed = output<void>();

  protected readonly canOpenOriginal = computed(() => /^https?:\/\//i.test(this.src() ?? ""));

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
