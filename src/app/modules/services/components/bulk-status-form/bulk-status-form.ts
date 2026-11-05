import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import { ServiceBranchOption, ServicesService } from "../../service/services.service";
import { localizedName } from "../../utils/service-labels.util";

/**
 * "Set status in several branches" (rendered inside a drawer) for the services ticked in the
 * list. `isActive` is the TARGET state (not a toggle) for every ticked branch. The backend
 * rejects a branch where a service has no price (400) and deactivating the last active service
 * of a visible branch (409); those messages arrive as toasts and the drawer stays open.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-bulk-status-form",
  standalone: true,
  imports: [TranslateModule, AppButtonComponent],
  templateUrl: "./bulk-status-form.html",
  styleUrls: ["../bulk-form.scss", "./bulk-status-form.scss"],
})
export class BulkStatusForm {
  private readonly servicesService = inject(ServicesService);
  private readonly language = inject(LanguageService);

  readonly branches = input.required<ServiceBranchOption[]>();
  /** Services ticked in the list. */
  readonly serviceIds = input.required<number[]>();

  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = this.servicesService.saving;
  protected readonly chosen = signal<number[]>([]);
  protected readonly target = signal<"activate" | "deactivate">("activate");

  protected readonly options = computed(() => {
    const lang = this.language.currentLang();
    return this.branches().map((b) => ({ id: b.id, label: localizedName(b.nameAr, b.nameEn, lang) }));
  });

  protected readonly allChosen = computed(
    () => this.branches().length > 0 && this.chosen().length === this.branches().length,
  );
  protected readonly canSubmit = computed(() => this.chosen().length > 0 && this.serviceIds().length > 0);

  protected toggle(id: number): void {
    this.chosen.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected toggleAll(): void {
    this.chosen.set(this.allChosen() ? [] : this.branches().map((b) => b.id));
  }

  protected submit(): void {
    if (this.saving() || !this.canSubmit()) return;

    this.servicesService
      .setStatusForServices(this.serviceIds(), this.chosen(), this.target() === "activate")
      .subscribe((ok) => {
        if (ok) this.done.emit();
      });
  }
}
