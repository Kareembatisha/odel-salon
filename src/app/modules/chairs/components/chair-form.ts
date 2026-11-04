import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
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
import { AppButtonComponent } from "../../../shared/components/app-button/app-button.component";
import { FloatLabelInput } from "../../../shared/components/float-label-input/float-label-input";
import {
  FloatLabelSelect,
  SelectOption,
} from "../../../shared/components/float-label-select/float-label-select";
import {
  CHAIR_NAME_MAX_LENGTH,
  ChairBranchOption,
  ChairDetails,
  ChairType,
  CreateChairPayload,
  UpdateChairPayload,
} from "../model/chair.model";
import { localizedName } from "../utils/chair-labels.util";

/** A name made only of spaces counts as empty (it would be trimmed to nothing). */
function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? "").trim() ? null : { required: true };
}

/**
 * Create / edit chair form (rendered inside a drawer).
 *
 *  - create: branch, name and type; emits a {@link CreateChairPayload}.
 *  - edit:   name and type only — a chair can't change branch, so the branch select is
 *            shown locked; emits an {@link UpdateChairPayload}. The same form serves the
 *            "Change type" action.
 *
 * Presentational: it validates the shape of the input and emits; uniqueness of the name
 * inside the branch and the "last active chair" lock are enforced by the backend, whose
 * message the error interceptor shows as a toast (the drawer stays open on failure).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-chair-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    FloatLabelInput,
    FloatLabelSelect,
  ],
  templateUrl: "./chair-form.html",
  styleUrl: "./chair-form.scss",
})
export class ChairForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly mode = input.required<"create" | "edit">();
  /** Loaded chair (edit mode). */
  readonly details = input<ChairDetails | null>(null);
  readonly branches = input.required<ChairBranchOption[]>();
  /** Create mode: branch to pre-select (the one currently filtered on the list). */
  readonly initialBranchId = input<number | null>(null);
  readonly saving = input<boolean>(false);

  /** {@link CreateChairPayload} in create mode, {@link UpdateChairPayload} in edit mode. */
  readonly submitted = output<CreateChairPayload | UpdateChairPayload>();
  readonly cancelled = output<void>();

  /** Select values are strings (native <select>); converted to numbers on submit. */
  protected readonly form = this.fb.nonNullable.group({
    branchId: ["", [Validators.required]],
    name: ["", [notBlank, Validators.maxLength(CHAIR_NAME_MAX_LENGTH)]],
    type: [String(ChairType.Regular), [Validators.required]],
  });

  protected readonly branchOptions = computed<SelectOption[]>(() => {
    const lang = this.language.currentLang();
    const options = this.branches().map((b) => ({
      value: String(b.id),
      label: localizedName(b.nameAr, b.nameEn, lang),
    }));

    // The chair's own branch must always be listed (locked), even if it's not in the loaded list.
    const d = this.details();
    if (d && !this.branches().some((b) => b.id === d.branchId)) {
      options.push({
        value: String(d.branchId),
        label: localizedName(d.branchNameAr, d.branchNameEn, lang),
      });
    }

    return [
      { value: "", label: this.translate.instant("CHAIRS.FORM.BRANCH_PLACEHOLDER") },
      ...options,
    ];
  });

  protected readonly typeOptions = computed<SelectOption[]>(() => {
    this.language.currentLang(); // re-translate when the language changes
    return [
      { value: String(ChairType.Regular), label: this.translate.instant("CHAIRS.TYPE.REGULAR") },
      { value: String(ChairType.Vip), label: this.translate.instant("CHAIRS.TYPE.VIP") },
    ];
  });

  ngOnInit(): void {
    const d = this.details();

    if (this.mode() === "edit" && d) {
      this.form.patchValue({
        branchId: String(d.branchId),
        name: d.name,
        type: String(d.type),
      });
      // Disabled controls are skipped by validation, so the locked branch never blocks submit.
      this.form.controls.branchId.disable();
      return;
    }

    const initial = this.initialBranchId();
    if (initial !== null && this.branches().some((b) => b.id === initial)) {
      this.form.patchValue({ branchId: String(initial) });
    }
  }

  protected error(name: "branchId" | "name"): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) {
      return name === "branchId" ? "CHAIRS.FORM.BRANCH_REQUIRED" : "CHAIRS.FORM.NAME_REQUIRED";
    }
    if (c.hasError("maxlength")) return "CHAIRS.FORM.NAME_MAX";
    return "";
  }

  protected submit(): void {
    if (this.saving()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const name = v.name.trim();
    const type = Number(v.type) as ChairType;

    this.submitted.emit(
      this.mode() === "create"
        ? { branchId: Number(v.branchId), name, type }
        : { name, type },
    );
  }
}
