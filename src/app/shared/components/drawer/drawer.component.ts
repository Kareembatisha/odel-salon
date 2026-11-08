import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

import { FocusTrapDirective } from "../../directives/focus-trap.directive";

/**
 * Drawer — side panel for create/edit forms. Opens from the inline-end edge
 * (right in LTR, left in RTL). Esc and backdrop click close it.
 *
 * Create the projected content only while open, so a form always starts clean:
 *   <app-drawer [open]="open()" title="…" (closed)="open.set(false)">
 *     @if (open()) { <app-my-form … /> }
 *   </app-drawer>
 */
@Component({
  selector: "app-drawer",
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    @if (open()) {
      <div class="dr__backdrop" (click)="closed.emit()" aria-hidden="true"></div>
      <aside
        class="dr"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dr-title"
        appFocusTrap
        appFocusTrapInitial="input, select, textarea, button:not(.dr__close)"
        (appFocusTrapEscape)="closed.emit()"
      >
        <header class="dr__head">
          <div class="dr__titles">
            <h2 id="dr-title" class="dr__title">{{ title() }}</h2>
            @if (subtitle()) { <p class="dr__subtitle">{{ subtitle() }}</p> }
          </div>
          <button type="button" class="dr__close" [attr.aria-label]="closeLabel()" (click)="closed.emit()">
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </header>
        <div class="dr__body"><ng-content /></div>
      </aside>
    }
  `,
  styleUrl: "./drawer.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerComponent {
  open = input<boolean>(false);
  title = input.required<string>();
  subtitle = input<string>("");
  closeLabel = input<string>("Close");
  closed = output<void>();
}
