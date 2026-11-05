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
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";
import { startWith } from "rxjs";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import {
  FloatLabelSelect,
  SelectOption,
} from "../../../../shared/components/float-label-select/float-label-select";
import { ServiceBranchOption, ServicesService } from "../../service/services.service";
import { localizedName } from "../../utils/service-labels.util";

/**
 * "Copy prices from another branch" (rendered inside a drawer).
 *
 * Copies duration, Regular / VIP / Home prices, home availability and status of every service
 * priced in the SOURCE onto the TARGET, overwriting what the target had for those services
 * (its other services stay as they are). The target defaults to the branch on screen. The
 * form shows how many services will be copied and blocks identical branches; the backend's own
 * 409 (the copy would leave a visible branch with no active service) arrives as a toast.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-copy-prices-form",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, AppButtonComponent, FloatLabelSelect],
  templateUrl: "./copy-prices-form.html",
  styleUrls: ["../bulk-form.scss"],
})
export class CopyPricesForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly servicesService = inject(ServicesService);
  private readonly language = inject(LanguageService);

  readonly branches = input.required<ServiceBranchOption[]>();
  /** The branch on screen — pre-selected as the TARGET. */
  readonly initialBranchId = input<number | null>(null);

  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = this.servicesService.saving;
  /** Services priced in the source branch; `null` while counting. */
  protected readonly sourceCount = signal<number | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    sourceBranchId: ["", [Validators.required]],
    targetBranchId: ["", [Validators.required]],
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private options(): SelectOption[] {
    const lang = this.language.currentLang();
    return this.branches().map((b) => ({ value: String(b.id), label: localizedName(b.nameAr, b.nameEn, lang) }));
  }

  protected readonly sourceOptions = computed(() => this.options());
  protected readonly targetOptions = computed(() => this.options());

  protected readonly sameBranch = computed(() => {
    const v = this.value();
    return !!v.sourceBranchId && v.sourceBranchId === v.targetBranchId;
  });

  protected readonly targetName = computed(() => {
    const lang = this.language.currentLang();
    const b = this.branches().find((x) => String(x.id) === this.value().targetBranchId);
    return b ? localizedName(b.nameAr, b.nameEn, lang) : "";
  });

  protected readonly canSubmit = computed(
    () => !!this.value().sourceBranchId && !!this.value().targetBranchId && !this.sameBranch() && (this.sourceCount() ?? 0) > 0,
  );

  ngOnInit(): void {
    const target = this.initialBranchId() ?? this.branches()[0]?.id ?? null;
    const source = this.branches().find((b) => b.id !== target)?.id ?? null;

    this.form.patchValue({
      targetBranchId: target !== null ? String(target) : "",
      sourceBranchId: source !== null ? String(source) : "",
    });

    this.countSource(source);
    this.form.controls.sourceBranchId.valueChanges.subscribe((id) => this.countSource(id ? Number(id) : null));
  }

  private countSource(branchId: number | null): void {
    this.sourceCount.set(null);
    if (branchId === null) return;

    this.servicesService.loadBranchServices(branchId).subscribe((rows) => {
      if (Number(this.form.controls.sourceBranchId.value) === branchId) this.sourceCount.set(rows.length);
    });
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid || !this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.servicesService
      .copyPrices({ sourceBranchId: Number(v.sourceBranchId), targetBranchId: Number(v.targetBranchId) })
      .subscribe((ok) => {
        if (ok) this.done.emit();
      });
  }
}
