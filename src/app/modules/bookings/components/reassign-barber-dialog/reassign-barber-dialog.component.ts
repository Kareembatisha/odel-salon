import { ChangeDetectionStrategy, Component, effect, input, output, signal } from "@angular/core";

import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FocusTrapDirective } from "@shared/directives/focus-trap.directive";

/** One barber the booking can be moved to. */
export interface ReassignOption {
  id: number;
  label: string;
}

/**
 * Asks which barber a booking moves to (Reassign Booking Barber).
 *
 *   <app-reassign-barber-dialog [isOpen]="open" [options]="barbers" title="…" … (confirm)="move($event)" (cancel)="open = false" />
 *
 * Texts are already translated by the caller (i18n-agnostic, like `app-confirm-modal`). The caller
 * lists the branch's other active barbers; whether one is free at that time is only known to the
 * server, which answers 409 — so any of them can be picked. Nothing is selected when it opens (a
 * choice made for one booking must never carry over to the next), and Confirm stays off until one
 * is. Escape / backdrop cancel; while `busy` the confirm button spins and a second submit is ignored.
 */
@Component({
  selector: "app-reassign-barber-dialog",
  standalone: true,
  imports: [AppButtonComponent, FocusTrapDirective],
  template: `
    @if (isOpen()) {
      <div class="backdrop" role="presentation" (click)="onBackdrop($event)">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-title"
          aria-describedby="reassign-hint"
          appFocusTrap
          appFocusTrapInitial="input"
          (appFocusTrapEscape)="cancel.emit()"
        >
          <span class="dialog__icon" aria-hidden="true"><i class="pi pi-user-edit"></i></span>
          <h2 id="reassign-title" class="dialog__title">{{ title() }}</h2>
          <p id="reassign-hint" class="dialog__hint">{{ hint() }}</p>

          @if (loading()) {
            <p class="dialog__empty" role="status">{{ loadingMessage() }}</p>
          } @else if (!options().length) {
            <p class="dialog__empty">{{ emptyMessage() }}</p>
          } @else {
            <fieldset class="options">
              <legend class="sr-only">{{ label() }}</legend>
              @for (option of options(); track option.id) {
                <label class="option" [class.option--selected]="selected() === option.id">
                  <input
                    type="radio"
                    name="reassign-barber"
                    [value]="option.id"
                    [checked]="selected() === option.id"
                    (change)="selected.set(option.id)"
                  />
                  <span class="option__label">{{ option.label }}</span>
                </label>
              }
            </fieldset>
          }

          <div class="dialog__actions">
            <app-button variant="secondary" (clicked)="cancel.emit()">{{ cancelLabel() }}</app-button>
            <app-button
              variant="primary"
              [disabled]="selected() === null"
              [loading]="busy()"
              (clicked)="submit()"
            >
              {{ confirmLabel() }}
            </app-button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: "./reassign-barber-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReassignBarberDialogComponent {
  readonly isOpen = input<boolean>(false);
  readonly title = input<string>("");
  /** What happens next — "The customer isn't notified automatically". */
  readonly hint = input<string>("");
  readonly label = input<string>("");
  readonly confirmLabel = input<string>("");
  readonly cancelLabel = input<string>("");
  readonly loadingMessage = input<string>("");
  /** Shown when the branch has no other active barber. */
  readonly emptyMessage = input<string>("");
  readonly options = input<ReassignOption[]>([]);
  /** The barbers are still being read. */
  readonly loading = input<boolean>(false);
  readonly busy = input<boolean>(false);

  /** The id of the chosen barber. */
  readonly confirm = output<number>();
  readonly cancel = output<void>();

  protected readonly selected = signal<number | null>(null);

  constructor() {
    effect(() => {
      if (this.isOpen()) this.selected.set(null);
    });
  }

  protected submit(): void {
    const barberId = this.selected();
    if (this.busy() || barberId === null) return;
    this.confirm.emit(barberId);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel.emit();
  }
}
