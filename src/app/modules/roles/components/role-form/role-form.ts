import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";

import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";

/** Name-only form used for both "New role" and "Rename role" inside a drawer. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-role-form",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, AppButtonComponent, FloatLabelInput],
  templateUrl: "./role-form.html",
  styleUrl: "./role-form.scss",
})
export class RoleForm {
  private readonly fb = inject(FormBuilder);

  /** Empty for "new role". */
  initialName = input<string>("");
  saving = input<boolean>(false);
  submitted = output<string>();
  cancelled = output<void>();

  protected readonly form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.maxLength(50)]],
  });

  constructor() {
    queueMicrotask(() => this.form.controls.name.setValue(this.initialName()));
  }

  protected nameError(): string {
    const c = this.form.controls.name;
    if (!c.touched) return "";
    if (c.hasError("required")) return "ROLES.FORM.NAME_REQUIRED";
    if (c.hasError("maxlength")) return "ROLES.FORM.NAME_MAX";
    return "";
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.controls.name.value.trim());
  }
}
