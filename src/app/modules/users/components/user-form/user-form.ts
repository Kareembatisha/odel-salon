import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { DEFAULT_COUNTRY_CODE, countryOptions } from "@shared/utils/countries";
import { passwordPolicyValidator } from "@shared/validators/password-policy.validator";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import {
  FloatLabelSelect,
  SelectOption,
} from "@shared/components/float-label-select/float-label-select";
import { maxTrimmedLength, notBlank } from "@shared/validators/text.validators";
import { CreateUserPayload, UpdateUserPayload, UserDetails } from "../../model/user.model";

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const a = group.get("password")?.value ?? "";
  const b = group.get("passwordConfirmation")?.value ?? "";
  return b && a !== b ? { mismatch: true } : null;
}

/**
 * Create / edit user form (rendered inside a drawer).
 *
 *  - create: password + confirmation are required.
 *  - edit:   password is OPTIONAL — only sent when "Change password" is switched on
 *            (the contract says to send newPassword/newPasswordConfirmation only to change it).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-user-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    FloatLabelInput,
    FloatLabelSelect,
  ],
  templateUrl: "./user-form.html",
  styleUrl: "./user-form.scss",
})
export class UserForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  mode = input.required<"create" | "edit">();
  /** Loaded user (edit mode). */
  details = input<UserDetails | null>(null);
  roles = input.required<Array<{ id: number; name: string }>>();
  saving = input<boolean>(false);

  /** CreateUserPayload in create mode, UpdateUserPayload in edit mode. */
  submitted = output<CreateUserPayload | UpdateUserPayload>();
  cancelled = output<void>();

  protected readonly changePassword = signal(false);
  protected readonly showPasswordFields = computed(
    () => this.mode() === "create" || this.changePassword(),
  );

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ["", [notBlank, maxTrimmedLength(100)]],
      email: ["", [Validators.required, Validators.email]],
      countryCode: [DEFAULT_COUNTRY_CODE],
      phoneNumber: ["", [Validators.required, Validators.pattern(/^\d{6,15}$/)]],
      roleId: ["", [Validators.required]],
      password: ["", [Validators.required, passwordPolicyValidator()]],
      passwordConfirmation: ["", [Validators.required]],
    },
    { validators: [passwordsMatch] },
  );

  protected readonly countries = computed<SelectOption[]>(() =>
    countryOptions(this.language.currentLang(), this.details()?.countryCode),
  );

  protected readonly roleOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.translate.instant("USERS.FORM.ROLE_PLACEHOLDER") },
    ...this.roles().map((r) => ({ value: String(r.id), label: r.name })),
  ]);

  ngOnInit(): void {
    const d = this.details();
    if (this.mode() === "edit" && d) {
      // GET /users/{id} returns the role NAME — map it back to an id through the roles list.
      const roleId = this.roles().find((r) => r.name === d.role)?.id;
      this.form.patchValue({
        fullName: d.fullName,
        email: d.email,
        countryCode: d.countryCode || DEFAULT_COUNTRY_CODE,
        phoneNumber: d.phoneNumber ?? "",
        roleId: roleId !== undefined ? String(roleId) : "",
      });
    }
    this.syncPasswordControls();
  }

  protected setChangePassword(on: boolean): void {
    this.changePassword.set(on);
    this.form.controls.password.reset("");
    this.form.controls.passwordConfirmation.reset("");
    this.syncPasswordControls();
  }

  /** Disabled controls are skipped by validation, so edit mode without "Change password" never blocks submit. */
  private syncPasswordControls(): void {
    const { password, passwordConfirmation } = this.form.controls;
    if (this.showPasswordFields()) {
      password.enable();
      passwordConfirmation.enable();
    } else {
      password.disable();
      passwordConfirmation.disable();
    }
  }

  protected error(
    name: "fullName" | "email" | "phoneNumber" | "roleId" | "password" | "passwordConfirmation",
  ): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) {
      return {
        fullName: "PROFILE.NAME_REQUIRED",
        email: "AUTH.EMAIL_REQUIRED",
        phoneNumber: "USERS.FORM.PHONE_REQUIRED",
        roleId: "USERS.FORM.ROLE_REQUIRED",
        password: "AUTH.PASSWORD_REQUIRED",
        passwordConfirmation: "AUTH.CONFIRM_PASSWORD_REQUIRED",
      }[name];
    }
    if (c.hasError("maxlength")) return "PROFILE.NAME_MAX";
    if (c.hasError("email")) return "AUTH.EMAIL_INVALID";
    if (c.hasError("pattern")) return "PROFILE.PHONE_INVALID";
    if (name === "password" && c.hasError("weak")) return "AUTH.PASSWORD_WEAK";
    if (name === "passwordConfirmation" && this.form.hasError("mismatch"))
      return "AUTH.PASSWORD_MISMATCH";
    return "";
  }

  protected submit(): void {
    if (this.saving()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const base = {
      fullName: v.fullName.trim(),
      email: v.email.trim(),
      countryCode: v.countryCode,
      phoneNumber: v.phoneNumber.trim(),
      roleId: Number(v.roleId),
    };
    if (this.mode() === "create") {
      this.submitted.emit({
        ...base,
        password: v.password,
        passwordConfirmation: v.passwordConfirmation,
      });
    } else {
      this.submitted.emit(
        this.changePassword()
          ? { ...base, newPassword: v.password, newPasswordConfirmation: v.passwordConfirmation }
          : base,
      );
    }
  }
}
