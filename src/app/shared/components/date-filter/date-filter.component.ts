import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

/**
 * Compact date field for list toolbars, styled like `app-filter-select`: a small label and a native
 * date input in one 42px box.
 *
 *   <app-date-filter label="From" [value]="from" [max]="to" (changed)="onFrom($event)" />
 *
 * Controlled: it never keeps a value of its own — `value` is `yyyy-MM-dd` or `""`, and `changed`
 * emits the new one (`""` when the field is cleared). `min` / `max` (`yyyy-MM-dd`) bound the date
 * picker; typing a date outside them is still possible, so the parent decides what to accept.
 */
@Component({
  selector: "app-date-filter",
  standalone: true,
  template: `
    <label class="df" [class.df--invalid]="invalid()">
      <span class="df__label">{{ label() }}</span>
      <input
        type="date"
        [value]="value()"
        [attr.min]="min() || null"
        [attr.max]="max() || null"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        (change)="changed.emit($any($event.target).value)"
      />
    </label>
  `,
  styleUrl: "./date-filter.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateFilterComponent {
  /** Already-translated text ("From"). */
  readonly label = input.required<string>();
  /** `yyyy-MM-dd`, or `""` for no date. */
  readonly value = input<string>("");
  readonly min = input<string>("");
  readonly max = input<string>("");
  /** Marks the field as wrong (red border, `aria-invalid`). */
  readonly invalid = input<boolean>(false);

  readonly changed = output<string>();
}
