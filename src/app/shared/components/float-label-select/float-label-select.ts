import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

export interface SelectOption {
  value: string;
  /** Already-translated text. */
  label: string;
}

/**
 * FloatLabelSelect — native <select> dressed like FloatLabelInput (ControlValueAccessor).
 * Native on purpose: best mobile UX, keyboard and screen-reader support for free.
 *
 *   <app-float-label-select label="PROFILE.COUNTRY_CODE" [options]="codes" formControlName="countryCode" />
 */
@Component({
  selector: 'app-float-label-select',
  standalone: true,
  imports: [TranslateModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FloatLabelSelect), multi: true }],
  template: `
    <div class="fls" [class.fls--focused]="focused()" [class.fls--disabled]="disabled()" [class.fls--error]="errorMessage()">
      <label class="fls__label">{{ label() | translate }}</label>
      <select
        class="fls__select"
        [disabled]="disabled()"
        [attr.aria-label]="label() | translate"
        (change)="onChange($event)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false); touched()"
      >
        @for (o of options(); track o.value) {
          <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
        }
      </select>
      <i class="pi pi-angle-down fls__chevron" aria-hidden="true"></i>
    </div>
    @if (errorMessage()) {
      <span class="fls__message" role="alert">{{ errorMessage() | translate }}</span>
    }
  `,
  styleUrl: './float-label-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatLabelSelect implements ControlValueAccessor {
  label = input.required<string>();
  options = input.required<SelectOption[]>();
  errorMessage = input<string>('');

  protected readonly value = signal('');
  protected readonly focused = signal(false);
  protected readonly disabled = signal(false);
  protected readonly hasValue = computed(() => this.value() !== '');

  private _change: (v: string) => void = () => {};
  private _touched: () => void = () => {};

  writeValue(v: string): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this._change = fn; }
  registerOnTouched(fn: () => void): void { this._touched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  protected touched(): void { this._touched(); }
  protected onChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.value.set(v);
    this._change(v);
  }
}
