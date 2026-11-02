import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

export type InputType = 'text' | 'email' | 'password' | 'tel' | 'number';

/**
 * FloatLabelInput — the text field of the design system (ControlValueAccessor).
 *
 * The label sits inside the field and lifts to the top edge when focused or
 * filled; the error message (translation key) renders below the box.
 *
 *   <app-float-label-input
 *     label="AUTH.EMAIL_LABEL" type="email" iconLeft="pi pi-envelope"
 *     [errorMessage]="ctrl.touched && ctrl.hasError('required') ? 'AUTH.EMAIL_REQUIRED' : ''"
 *     formControlName="email" />
 */
@Component({
  selector: 'app-float-label-input',
  standalone: true,
  imports: [TranslateModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FloatLabelInput), multi: true },
  ],
  templateUrl: './float-label-input.html',
  styleUrl: './float-label-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatLabelInput implements ControlValueAccessor {
  label = input.required<string>();
  type = input<InputType>('text');
  iconLeft = input<string>('');
  errorMessage = input<string>('');
  hint = input<string>('');
  autocomplete = input<string>('off');

  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('field');

  protected value = signal('');
  protected isFocused = signal(false);
  protected showPassword = signal(false);
  protected isDisabled = signal(false);

  protected isFloated = computed(() => this.isFocused() || this.value().length > 0);
  protected resolvedType = computed<InputType>(() =>
    this.type() === 'password' && this.showPassword() ? 'text' : this.type(),
  );

  private _onChange: (v: string) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(val: string): void { this.value.set(val ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  protected onInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.value.set(val);
    this._onChange(val);
  }
  protected onFocus(): void { this.isFocused.set(true); }
  protected onBlur(): void { this.isFocused.set(false); this._onTouched(); }
  protected togglePassword(): void { this.showPassword.update((v) => !v); }
  /** Clicking anywhere in the box (icon, padding) focuses the input. */
  protected focusInput(): void { this.inputEl()?.nativeElement.focus(); }
}
