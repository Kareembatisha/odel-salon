import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { FloatLabelInput } from '../../../shared/components/float-label-input/float-label-input';

/** Name-only form used for both "New role" and "Rename role" inside a drawer. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-role-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, AppButtonComponent, FloatLabelInput],
  template: `
    <form class="rf" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="rf__body">
        <app-float-label-input label="ROLES.FORM.NAME" iconLeft="pi pi-shield"
          [errorMessage]="nameError()" formControlName="name" />
        @if (!initialName()) { <p class="rf__hint"><i class="pi pi-info-circle" aria-hidden="true"></i>{{ 'ROLES.FORM.CREATE_HINT' | translate }}</p> }
      </div>
      <footer class="rf__footer">
        <app-button variant="secondary" (clicked)="cancelled.emit()">{{ 'COMMON.CANCEL' | translate }}</app-button>
        <app-button type="submit" variant="primary" [loading]="saving()">
          {{ (initialName() ? 'COMMON.SAVE' : 'ROLES.FORM.CREATE') | translate }}
        </app-button>
      </footer>
    </form>
  `,
  styles: [`
    .rf { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .rf__body { flex: 1; padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
    .rf__hint { display: flex; gap: 8px; color: var(--odl-text-secondary); font-size: 13px; }
    .rf__footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--odl-border); }
  `],
})
export class RoleForm {
  private readonly fb = inject(FormBuilder);

  /** Empty for "new role". */
  initialName = input<string>('');
  saving = input<boolean>(false);
  submitted = output<string>();
  cancelled = output<void>();

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
  });

  constructor() {
    queueMicrotask(() => this.form.controls.name.setValue(this.initialName()));
  }

  protected nameError(): string {
    const c = this.form.controls.name;
    if (!c.touched) return '';
    if (c.hasError('required')) return 'ROLES.FORM.NAME_REQUIRED';
    if (c.hasError('maxlength')) return 'ROLES.FORM.NAME_MAX';
    return '';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.controls.name.value.trim());
  }
}
