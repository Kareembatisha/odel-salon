import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";

import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FocusTrapDirective } from "@shared/directives/focus-trap.directive";

/**
 * Asks for the reason a booking is rejected — it is required and the CUSTOMER sees it.
 *
 *   <app-reject-dialog [isOpen]="open" [maxLength]="500" title="…" … (confirm)="reject($event)" (cancel)="open = false" />
 *
 * Texts are already translated by the caller (i18n-agnostic, like `app-confirm-modal`). The reason
 * is trimmed; an empty one is not sent and shows `requiredMessage` instead. The text box stops at
 * `maxLength` (typing and pasting) and shows a live counter. It starts empty every time it opens.
 * Escape / backdrop cancel; while `busy` the confirm button spins and a second submit is ignored.
 */
@Component({
  selector: "app-reject-dialog",
  standalone: true,
  imports: [AppButtonComponent, FocusTrapDirective],
  template: `
    @if (isOpen()) {
      <div class="backdrop" role="presentation" (click)="onBackdrop($event)">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          aria-describedby="reject-hint"
          appFocusTrap
          appFocusTrapInitial="textarea"
          (appFocusTrapEscape)="cancel.emit()"
        >
          <span class="dialog__icon" aria-hidden="true"><i class="pi pi-ban"></i></span>
          <h2 id="reject-title" class="dialog__title">{{ title() }}</h2>
          <p id="reject-hint" class="dialog__hint">{{ hint() }}</p>

          <label class="field">
            <span class="field__label">{{ label() }}</span>
            <textarea
              class="field__input"
              rows="4"
              [class.field__input--invalid]="!!error()"
              [value]="reason()"
              [placeholder]="placeholder()"
              [attr.maxlength]="maxLength()"
              [attr.aria-invalid]="error() ? 'true' : null"
              [attr.aria-describedby]="error() ? 'reject-error reject-counter' : 'reject-counter'"
              (input)="onInput($event)"
            ></textarea>
          </label>

          <div class="dialog__meta">
            @if (error()) {
              <span id="reject-error" class="dialog__error" role="alert">{{ error() }}</span>
            }
            <span id="reject-counter" class="dialog__counter u-num">{{ counter() }}</span>
          </div>

          <div class="dialog__actions">
            <app-button variant="secondary" (clicked)="cancel.emit()">{{ cancelLabel() }}</app-button>
            <app-button variant="danger" [loading]="busy()" (clicked)="submit()">{{ confirmLabel() }}</app-button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: "./reject-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectDialogComponent {
  readonly isOpen = input<boolean>(false);
  readonly title = input<string>("");
  /** What happens next — "The customer will see this reason". */
  readonly hint = input<string>("");
  readonly label = input<string>("");
  readonly placeholder = input<string>("");
  readonly confirmLabel = input<string>("");
  readonly cancelLabel = input<string>("");
  /** Shown when the reason is empty on submit. */
  readonly requiredMessage = input<string>("");
  readonly maxLength = input<number>(500);
  readonly busy = input<boolean>(false);

  /** The trimmed, non-empty reason. */
  readonly confirm = output<string>();
  readonly cancel = output<void>();

  protected readonly reason = signal("");
  private readonly submitted = signal(false);

  protected readonly counter = computed(() => `${this.reason().length}/${this.maxLength()}`);

  /** Required — only shown after a submit attempt (not while the user hasn't typed yet). */
  protected readonly error = computed(() =>
    this.submitted() && !this.reason().trim() ? this.requiredMessage() : "",
  );

  constructor() {
    // A reason written for one booking must never carry over to the next one.
    effect(() => {
      if (this.isOpen()) {
        this.reason.set("");
        this.submitted.set(false);
      }
    });
  }

  protected onInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected submit(): void {
    if (this.busy()) return;
    this.submitted.set(true);

    const reason = this.reason().trim();
    if (!reason) return;
    this.confirm.emit(reason);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel.emit();
  }
}
