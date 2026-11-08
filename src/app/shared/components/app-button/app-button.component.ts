import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

/**
 * AppButton — the one button of the design system.
 *
 *   primary    solid gold      main action on a screen (one per view)
 *   secondary  neutral         Cancel, Back
 *   outline    gold outline    secondary action next to a primary one
 *   danger     solid red       destructive confirm (Delete, Cancel booking)
 *   ghost      no chrome       tertiary / icon-only actions
 *   export     neutral + icon  Export / download actions
 *
 * Usage:
 *   <app-button variant="primary" iconClass="pi pi-plus" (clicked)="add()">Add branch</app-button>
 */
export type ButtonVariant = "primary" | "outline" | "secondary" | "danger" | "ghost" | "export";
export type ButtonSize = "sm" | "md" | "lg";

@Component({
  selector: "app-button",
  standalone: true,
  templateUrl: "./app-button.component.html",
  styleUrl: "./app-button.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppButtonComponent {
  variant = input<ButtonVariant>("primary");
  size = input<ButtonSize>("md");
  type = input<"button" | "submit" | "reset">("button");
  disabled = input<boolean>(false);
  /** Replaces the icon with a spinner and blocks clicks. */
  loading = input<boolean>(false);
  /** PrimeIcons class for a leading icon, e.g. "pi pi-download". */
  iconClass = input<string>("");
  /** Stretch to the container width (stacked mobile footers, auth forms). */
  fullWidth = input<boolean>(false);
  /** Accessible name for icon-only buttons. */
  ariaLabel = input<string | null>(null);

  clicked = output<MouseEvent>();

  protected onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) return;
    this.clicked.emit(event);
  }
}
