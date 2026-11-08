import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

import { FocusTrapDirective } from "../../directives/focus-trap.directive";
import { AppButtonComponent } from "../app-button/app-button.component";

export type ConfirmModalVariant = "danger" | "primary";

/**
 * Generic confirm/cancel dialog (delete, cancel booking, discard changes…).
 * Texts are already translated by the caller, which keeps this i18n-agnostic.
 * Escape (from anywhere) / backdrop click cancel. FocusTrap keeps Tab inside, focuses the safe
 * (cancel) action on open, and returns focus to the opener on close.
 */
@Component({
  selector: "app-confirm-modal",
  standalone: true,
  imports: [AppButtonComponent, FocusTrapDirective],
  templateUrl: "./confirm-modal.component.html",
  styleUrl: "./confirm-modal.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent {
  isOpen = input<boolean>(false);
  title = input<string>("");
  message = input<string>("");
  confirmLabel = input<string>("Confirm");
  cancelLabel = input<string>("Cancel");
  variant = input<ConfirmModalVariant>("danger");
  /** Disable + spin the confirm button while a request is in flight. */
  busy = input<boolean>(false);

  confirm = output<void>();
  cancel = output<void>();

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel.emit();
  }
}
