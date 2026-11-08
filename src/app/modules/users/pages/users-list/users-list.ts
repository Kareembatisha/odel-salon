import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { AuthService } from "../../../auth/service/auth.service";
import { RolesService } from "../../../roles/service/roles.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import {
  DataTableCardDirective,
  DataTableColumnDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { DrawerComponent } from "@shared/components/drawer/drawer.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SearchInputComponent } from "@shared/components/search-input/search-input.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { HasPermissionDirective } from "@shared/directives/has-permission.directive";
import { UserForm } from "../../components/user-form/user-form";
import {
  CreateUserRequest,
  UpdateUserRequest,
  UserDetails,
  UserListItem,
} from "../../model/user.model";
import { UsersService } from "../../service/users.service";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-users-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    SearchInputComponent,
    FilterSelectComponent,
    DataTableComponent,
    DataTableColumnDirective,
    DataTableCardDirective,
    StatusBadgeComponent,
    AvatarComponent,
    SwitchComponent,
    DrawerComponent,
    ConfirmModalComponent,
    FailedStateComponent,
    SkeletonComponent,
    HasPermissionDirective,
    UserForm,
  ],
  templateUrl: "./users-list.html",
  styleUrl: "./users-list.scss",
})
export class UsersList implements OnInit {
  private readonly users = inject(UsersService);
  private readonly roles = inject(RolesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  protected readonly P = PERMISSIONS;
  protected readonly rows = this.users.users;
  protected readonly meta = this.users.meta;
  protected readonly loading = this.users.loading;
  protected readonly saving = this.users.saving;
  protected readonly hasError = this.users.hasError;
  protected readonly query = this.users.query;

  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.User.Edit));
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.User.Delete));

  /** You can't deactivate or delete your own account from here. */
  protected readonly selfId = computed(() => this.auth.currentUser()?.id);
  protected readonly lockedIds = computed(() =>
    this.selfId() !== undefined ? [this.selfId()!] : [],
  );

  // ── Filters ──────────────────────────────────────────
  protected readonly roleList = signal<Array<{ id: number; name: string }>>([]);
  protected readonly roleFilterOptions = computed<FilterOption[]>(() => [
    { value: "", label: this.translate.instant("USERS.FILTER.ALL_ROLES") },
    ...this.roleList().map((r) => ({ value: String(r.id), label: r.name })),
  ]);
  protected readonly statusFilterOptions = computed<FilterOption[]>(() => [
    { value: "", label: this.translate.instant("USERS.FILTER.ALL_STATUSES") },
    { value: "true", label: this.translate.instant("USERS.STATUS.ACTIVE") },
    { value: "false", label: this.translate.instant("USERS.STATUS.INACTIVE") },
  ]);

  protected readonly selection = signal<Array<string | number>>([]);

  // ── Drawer (create / edit) ───────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<"create" | "edit">("create");
  protected readonly editDetails = signal<UserDetails | null>(null);
  protected readonly drawerLoading = signal(false);

  // ── Delete confirmation ──────────────────────────────
  protected readonly pendingDelete = signal<UserListItem[]>([]);
  protected readonly deleteMessage = computed(() => {
    const items = this.pendingDelete();
    if (!items.length) return "";
    return items.length === 1
      ? this.translate.instant("USERS.DELETE.MESSAGE_ONE", { name: items[0].fullName })
      : this.translate.instant("USERS.DELETE.MESSAGE_MANY", { count: items.length });
  });

  ngOnInit(): void {
    this.users.load();
    this.roles.loadOptions().subscribe((list) => this.roleList.set(list));
  }

  // ── Filtering / paging ───────────────────────────────
  protected onSearch(term: string): void {
    this.selection.set([]);
    this.users.setFilters({ search: term || undefined });
  }

  protected onRoleFilter(value: string): void {
    this.selection.set([]);
    this.users.setFilters({ roleId: value === "" ? undefined : Number(value) });
  }

  protected onStatusFilter(value: string): void {
    this.selection.set([]);
    this.users.setFilters({ status: value === "" ? undefined : value === "true" });
  }

  protected onPage(page: number): void {
    this.selection.set([]);
    this.users.setPage(page);
  }

  protected reload(): void {
    this.users.load();
  }

  // ── Create / edit ────────────────────────────────────
  protected openCreate(): void {
    this.drawerMode.set("create");
    this.editDetails.set(null);
    this.drawerLoading.set(false);
    this.drawerOpen.set(true);
  }

  protected openEdit(user: UserListItem): void {
    if (!this.canEdit()) return;
    this.drawerMode.set("edit");
    this.editDetails.set(null);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);
    this.users.getUser(user.id).subscribe((details) => {
      this.drawerLoading.set(false);
      if (details) this.editDetails.set(details);
      else this.drawerOpen.set(false); // interceptor already showed why
    });
  }

  protected onSubmitted(payload: CreateUserRequest | UpdateUserRequest): void {
    const request =
      this.drawerMode() === "create"
        ? this.users.create(payload as CreateUserRequest)
        : this.users.update(this.editDetails()!.id, payload as UpdateUserRequest);
    request.subscribe((ok) => ok && this.drawerOpen.set(false));
  }

  // ── Status ───────────────────────────────────────────
  protected toggle(user: UserListItem): void {
    this.users.toggleStatus(user.id).subscribe();
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(user: UserListItem, event: Event): void {
    event.stopPropagation();
    this.pendingDelete.set([user]);
  }

  protected askBulkDelete(): void {
    const ids = this.selection();
    this.pendingDelete.set(this.rows().filter((u) => ids.includes(u.id)));
  }

  protected confirmDelete(): void {
    const ids = this.pendingDelete().map((u) => u.id);
    this.users.remove(ids).subscribe((ok) => {
      if (ok) {
        this.pendingDelete.set([]);
        this.selection.set([]);
      }
    });
  }

  protected isSelf(user: UserListItem): boolean {
    return user.id === this.selfId();
  }
}
