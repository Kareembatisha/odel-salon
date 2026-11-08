import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from "@angular/core";

/** One tab: its value, the (already translated) label and an optional count pill. */
export interface TabItem {
  value: string;
  label: string;
  /** Shown as a small pill after the label; omit (or `null`) for no pill. */
  count?: number | null;
}

/**
 * TabsComponent — a row of tabs that filters one list (WAI-ARIA tabs pattern).
 *
 *   <app-tabs [tabs]="tabs()" [value]="tab()" ariaLabel="Offers by status" (changed)="onTab($event)" />
 *
 * Controlled: it never changes `value` itself, it emits `changed` and the parent decides
 * (so a refused or pending change can't leave the UI out of sync). Arrow keys / Home / End move
 * the focus between tabs (Arrow keys follow the reading direction, so they flip in RTL);
 * Enter / Space — or a click — selects the focused tab. Selecting is manual on purpose:
 * each selection loads data, and arrowing through the row shouldn't fire a request per tab.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-tabs",
  standalone: true,
  templateUrl: "./tabs.component.html",
  styleUrl: "./tabs.component.scss",
})
export class TabsComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly tabs = input.required<TabItem[]>();
  /** `value` of the selected tab. */
  readonly value = input.required<string>();
  /** Names the tab list for screen readers ("Offers by status"). */
  readonly ariaLabel = input<string>("");
  /** Prefix of the tab ids (`<prefix>-<value>`), so a panel can point back with `aria-labelledby`. */
  readonly idPrefix = input<string>("tab");
  /** `id` of the panel the tabs control (`aria-controls`) — leave empty when there is none. */
  readonly panelId = input<string>("");

  readonly changed = output<string>();

  protected select(value: string): void {
    if (value !== this.value()) this.changed.emit(value);
  }

  /** Arrow keys flip with the reading direction; Home / End jump to the ends. */
  protected onKeydown(event: KeyboardEvent): void {
    const buttons = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    const rtl = getComputedStyle(this.host.nativeElement).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    let next: number;
    switch (event.key) {
      case forward:
        next = (current + 1) % buttons.length;
        break;
      case backward:
        next = (current - 1 + buttons.length) % buttons.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = buttons.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    buttons[next].focus();
  }
}
