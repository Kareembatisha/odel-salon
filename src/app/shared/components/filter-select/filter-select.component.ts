import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

export interface FilterOption {
  value: string;
  /** Already-translated text. */
  label: string;
}

/** Compact native select for list toolbars (the first option is normally "All"). */
@Component({
  selector: "app-filter-select",
  standalone: true,
  template: `
    <label class="fs">
      <span class="sr-only">{{ label() }}</span>
      <select [attr.aria-label]="label()" (change)="changed.emit($any($event.target).value)">
        @for (o of options(); track o.value) {
          <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
        }
      </select>
      <i class="pi pi-angle-down" aria-hidden="true"></i>
    </label>
  `,
  styleUrl: "./filter-select.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterSelectComponent {
  label = input.required<string>();
  options = input.required<FilterOption[]>();
  value = input<string>("");
  changed = output<string>();
}
