import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import {
  FloatLabelSelect,
  SelectOption,
} from "@shared/components/float-label-select/float-label-select";
import {
  BARBER_IMAGE_ACCEPT,
  BARBER_NAME_MAX_LENGTH,
  BarberBranchOption,
  BarberDetails,
  CreateBarberPayload,
  UpdateBarberPayload,
} from "../../model/barber.model";
import { egyptianMobile, notBlank } from "../../utils/barber-form.validators";
import {
  createPreviewUrl,
  revokePreviewUrl,
  validateBarberImage,
} from "../../utils/barber-image.util";
import { localizedName } from "../../utils/barber-labels.util";
import { normalizeEgyptianPhone } from "../../utils/barber-phone.util";

/**
 * Create / edit barber form (rendered inside a drawer).
 *
 *  - Photo is optional. Picking one previews it locally; in edit mode "Remove photo"
 *    sends `removeImage` (the photo only changes when the form is saved).
 *  - The branch can be changed in edit mode — that TRANSFERS the barber, so a note says so.
 *  - The phone accepts any common Egyptian way of writing it and is sent as `+201XXXXXXXXX`.
 *
 * Emits a {@link CreateBarberPayload} in create mode and an {@link UpdateBarberPayload} in edit mode.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-barber-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    AvatarComponent,
    FloatLabelInput,
    FloatLabelSelect,
  ],
  templateUrl: "./barber-form.html",
  styleUrl: "./barber-form.scss",
})
export class BarberForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotificationService);

  mode = input.required<"create" | "edit">();
  /** Loaded barber (edit mode). */
  details = input<BarberDetails | null>(null);
  branches = input.required<BarberBranchOption[]>();
  /** Branch to preselect when creating (the one the list is filtered to). */
  initialBranchId = input<number | null>(null);
  saving = input<boolean>(false);

  /** CreateBarberPayload in create mode, UpdateBarberPayload in edit mode. */
  submitted = output<CreateBarberPayload | UpdateBarberPayload>();
  cancelled = output<void>();

  protected readonly accept = BARBER_IMAGE_ACCEPT;

  protected readonly form = this.fb.nonNullable.group({
    branchId: ["", [Validators.required]],
    fullName: ["", [notBlank, Validators.maxLength(BARBER_NAME_MAX_LENGTH)]],
    phone: ["", [notBlank, egyptianMobile]],
  });

  // Control values are not signals; mirror the ones the template reads so OnPush re-renders.
  private readonly nameValue = toSignal(this.form.controls.fullName.valueChanges, {
    initialValue: "",
  });
  private readonly branchValue = toSignal(this.form.controls.branchId.valueChanges, {
    initialValue: "",
  });

  // ── Photo ────────────────────────────────────────────
  protected readonly pendingImage = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly removeImage = signal(false);

  protected readonly shownImage = computed(
    () => this.previewUrl() ?? (this.removeImage() ? null : (this.details()?.imageUrl ?? null)),
  );
  protected readonly hasPhoto = computed(() => !!this.shownImage() || !!this.pendingImage());
  protected readonly photoChanged = computed(() => !!this.pendingImage() || this.removeImage());

  // ── Branch ───────────────────────────────────────────
  protected readonly branchOptions = computed<SelectOption[]>(() => {
    const lang = this.language.currentLang();
    const list = [...this.branches()];
    const d = this.details();
    // A branch that is no longer in the list must still show as the current value.
    if (d && !list.some((b) => b.id === d.branchId)) {
      list.push({ id: d.branchId, nameAr: d.branchNameAr, nameEn: d.branchNameEn });
    }
    return [
      { value: "", label: this.translate.instant("BARBERS.FORM.BRANCH_PLACEHOLDER") },
      ...list.map((b) => ({ value: String(b.id), label: localizedName(b, lang) })),
    ];
  });

  /** Editing, and the chosen branch differs from the barber's current one. */
  protected readonly isTransfer = computed(() => {
    const d = this.details();
    return (
      this.mode() === "edit" &&
      !!d &&
      !!this.branchValue() &&
      this.branchValue() !== String(d.branchId)
    );
  });

  protected readonly displayName = computed(
    () => this.nameValue() || this.details()?.fullName || "",
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => revokePreviewUrl(this.previewUrl()));
  }

  ngOnInit(): void {
    const d = this.details();
    if (this.mode() === "edit" && d) {
      this.form.patchValue({ branchId: String(d.branchId), fullName: d.fullName, phone: d.phone });
    } else if (this.initialBranchId() !== null) {
      this.form.patchValue({ branchId: String(this.initialBranchId()) });
    }
  }

  // ── Photo handlers ───────────────────────────────────
  protected onPickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow picking the same file again later
    if (!file) return;

    const problem = validateBarberImage(file);
    if (problem) {
      this.notify.error(
        problem === "type" ? "FILE_VALIDATION.UNSUPPORTED_TYPE" : "FILE_VALIDATION.FILE_TOO_LARGE",
        "BARBERS.FORM.PHOTO_HINT",
      );
      return;
    }

    revokePreviewUrl(this.previewUrl());
    this.pendingImage.set(file);
    this.previewUrl.set(createPreviewUrl(file));
    this.removeImage.set(false);
  }

  protected removePhoto(): void {
    revokePreviewUrl(this.previewUrl());
    this.pendingImage.set(null);
    this.previewUrl.set(null);
    // Only an existing server photo needs a "remove" instruction; a just-picked one is simply dropped.
    this.removeImage.set(!!this.details()?.imageUrl);
  }

  // ── Validation ───────────────────────────────────────
  protected error(name: "branchId" | "fullName" | "phone"): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) {
      return {
        branchId: "BARBERS.FORM.BRANCH_REQUIRED",
        fullName: "BARBERS.FORM.NAME_REQUIRED",
        phone: "BARBERS.FORM.PHONE_REQUIRED",
      }[name];
    }
    if (c.hasError("maxlength")) return "BARBERS.FORM.NAME_MAX";
    if (c.hasError("phone")) return "BARBERS.FORM.PHONE_INVALID";
    return "";
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const base: CreateBarberPayload = {
      branchId: Number(v.branchId),
      fullName: v.fullName.trim(),
      phone: normalizeEgyptianPhone(v.phone),
      image: this.pendingImage(),
    };

    this.submitted.emit(
      this.mode() === "create" ? base : { ...base, removeImage: this.removeImage() },
    );
  }
}
