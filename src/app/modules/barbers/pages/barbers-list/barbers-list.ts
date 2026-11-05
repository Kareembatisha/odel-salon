import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PERMISSIONS } from '@core/auth/permissions';
import { LanguageService } from '@core/services/language.service';
import { AuthService } from '../../../auth/service/auth.service';
import { BranchesService } from '../../../branches/service/branches.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { DataTableCardDirective, DataTableColumnDirective, DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { FailedStateComponent } from '../../../../shared/components/failed-state/failed-state.component';
import { FilterOption, FilterSelectComponent } from '../../../../shared/components/filter-select/filter-select.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SearchInputComponent } from '../../../../shared/components/search-input/search-input.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { SwitchComponent } from '../../../../shared/components/switch/switch.component';
import { BarberForm } from '../../components/barber-form';
import {
  BarberBranchOption,
  BarberDetails,
  BarberListItem,
  CreateBarberPayload,
  UpdateBarberPayload,
} from '../../model/barber.model';
import { BarbersService } from '../../service/barbers.service';
import { localizedBranchName, localizedName } from '../../utils/barber-labels.util';

/**
 * Barbers screen — a Users-style table with server-side search, branch and status
 * filters, a status switch per row, multi-select bulk delete, and a side drawer for
 * create / edit (the drawer loads GET /barbers/{id} before showing the edit form).
 *
 * Permissions are read lazily (computed) — never in a field initializer — and every
 * action is hidden, not just disabled, when the user lacks it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-barbers-list',
  standalone: true,
  imports: [
    TranslateModule, PageHeaderComponent, AppButtonComponent, SearchInputComponent, FilterSelectComponent,
    DataTableComponent, DataTableColumnDirective, DataTableCardDirective, StatusBadgeComponent, AvatarComponent, SwitchComponent,
    DrawerComponent, ConfirmModalComponent, FailedStateComponent, SkeletonComponent, BarberForm,
  ],
  templateUrl: './barbers-list.html',
  styleUrl: './barbers-list.scss',
})
export class BarbersList implements OnInit {
  private readonly barbers = inject(BarbersService);
  private readonly branchesService = inject(BranchesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly rows = this.barbers.barbers;
  protected readonly meta = this.barbers.meta;
  protected readonly loading = this.barbers.loading;
  protected readonly saving = this.barbers.saving;
  protected readonly hasError = this.barbers.hasError;
  protected readonly query = this.barbers.query;

  protected readonly canCreate = computed(() => this.auth.hasPermission(PERMISSIONS.Barber.Create));
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Barber.Edit));
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Barber.Delete));

  // ── Filters ──────────────────────────────────────────
  protected readonly branchList = signal<BarberBranchOption[]>([]);
  protected readonly branchFilterOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.translate.instant('BARBERS.FILTER.ALL_BRANCHES') },
    ...this.branchList().map((b) => ({ value: String(b.id), label: localizedName(b, this.language.currentLang()) })),
  ]);
  protected readonly statusFilterOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.translate.instant('BARBERS.FILTER.ALL_STATUSES') },
    { value: 'true', label: this.translate.instant('BARBERS.STATUS.ACTIVE') },
    { value: 'false', label: this.translate.instant('BARBERS.STATUS.SUSPENDED') },
  ]);

  /** Any filter or search applied — decides between the "nothing yet" and "no matches" empty states. */
  protected readonly isFiltered = computed(() => {
    const q = this.query();
    return !!q.search || q.branchId !== undefined || q.isActive !== undefined;
  });

  protected readonly selection = signal<Array<string | number>>([]);

  // ── Drawer (create / edit) ───────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<'create' | 'edit'>('create');
  protected readonly editDetails = signal<BarberDetails | null>(null);
  protected readonly drawerLoading = signal(false);
  /** Bumped on every open so a late details response can't reopen a drawer the user already closed. */
  private drawerToken = 0;

  // ── Delete confirmation ──────────────────────────────
  protected readonly pendingDelete = signal<BarberListItem[]>([]);
  protected readonly deleteMessage = computed(() => {
    const items = this.pendingDelete();
    if (!items.length) return '';
    return items.length === 1
      ? this.translate.instant('BARBERS.DELETE.MESSAGE_ONE', { name: items[0].fullName })
      : this.translate.instant('BARBERS.DELETE.MESSAGE_MANY', { count: items.length });
  });

  ngOnInit(): void {
    // Always start from page 1 with no filters, even if the (root-provided) service remembers an earlier visit.
    this.selection.set([]);
    this.barbers.setFilters({ search: undefined, branchId: undefined, isActive: undefined });
    this.branchesService.loadOptions().subscribe((list) => this.branchList.set(list));
  }

  // ── Labels ───────────────────────────────────────────
  protected branchName(row: BarberListItem): string {
    return localizedBranchName(row, this.language.currentLang());
  }

  // ── Filtering / paging ───────────────────────────────
  protected onSearch(term: string): void {
    this.selection.set([]);
    this.barbers.setFilters({ search: term || undefined });
  }

  protected onBranchFilter(value: string): void {
    this.selection.set([]);
    this.barbers.setFilters({ branchId: value === '' ? undefined : Number(value) });
  }

  protected onStatusFilter(value: string): void {
    this.selection.set([]);
    this.barbers.setFilters({ isActive: value === '' ? undefined : value === 'true' });
  }

  protected onPage(page: number): void {
    this.selection.set([]);
    this.barbers.setPage(page);
  }

  protected reload(): void {
    this.barbers.load();
  }

  // ── Create / edit ────────────────────────────────────
  protected openCreate(): void {
    this.drawerToken++;
    this.drawerMode.set('create');
    this.editDetails.set(null);
    this.drawerLoading.set(false);
    this.drawerOpen.set(true);
  }

  protected openEdit(barber: BarberListItem): void {
    if (!this.canEdit()) return;
    const token = ++this.drawerToken;
    this.drawerMode.set('edit');
    this.editDetails.set(null);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);
    this.barbers.getBarber(barber.id).subscribe((details) => {
      if (token !== this.drawerToken) return;
      this.drawerLoading.set(false);
      if (details) this.editDetails.set(details);
      else this.drawerOpen.set(false); // the interceptor already showed why
    });
  }

  protected closeDrawer(): void {
    this.drawerToken++;
    this.drawerOpen.set(false);
  }

  protected onSubmitted(payload: CreateBarberPayload | UpdateBarberPayload): void {
    // create → new id | null, update → boolean; both mean "failed" when null / false.
    const done = (result: number | boolean | null) => {
      if (result !== null && result !== false) this.closeDrawer();
    };

    if (this.drawerMode() === 'create') {
      this.barbers.createBarber(payload as CreateBarberPayload).subscribe(done);
    } else {
      this.barbers.updateBarber(this.editDetails()!.id, payload as UpdateBarberPayload).subscribe(done);
    }
  }

  // ── Status ───────────────────────────────────────────
  protected toggle(barber: BarberListItem): void {
    this.barbers.toggleStatus(barber.id).subscribe();
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(barber: BarberListItem, event: Event): void {
    event.stopPropagation();
    this.pendingDelete.set([barber]);
  }

  protected askBulkDelete(): void {
    const ids = this.selection();
    this.pendingDelete.set(this.rows().filter((b) => ids.includes(b.id)));
  }

  protected confirmDelete(): void {
    const ids = this.pendingDelete().map((b) => b.id);
    this.barbers.remove(ids).subscribe((ok) => {
      if (ok) {
        this.pendingDelete.set([]);
        this.selection.set([]);
      }
    });
  }
}
