import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { AuthService } from "../../../auth/service/auth.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import {
  DataTableColumnDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { DrawerComponent } from "@shared/components/drawer/drawer.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SearchInputComponent } from "@shared/components/search-input/search-input.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { HasPermissionDirective } from "@shared/directives/has-permission.directive";
import { RoleListItem } from "../../model/role.model";
import { RolesService } from "../../service/roles.service";
import { RoleForm } from "../../components/role-form/role-form";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-roles-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    SearchInputComponent,
    DataTableComponent,
    DataTableColumnDirective,
    StatusBadgeComponent,
    DrawerComponent,
    ConfirmModalComponent,
    FailedStateComponent,
    HasPermissionDirective,
    RoleForm,
  ],
  templateUrl: "./roles-list.html",
  styleUrl: "./roles-list.scss",
})
export class RolesList implements OnInit {
  private readonly roles = inject(RolesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly P = PERMISSIONS;
  protected readonly rows = this.roles.roles;
  protected readonly meta = this.roles.meta;
  protected readonly loading = this.roles.loading;
  protected readonly saving = this.roles.saving;
  protected readonly hasError = this.roles.hasError;

  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Role.Delete));
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Role.Edit));

  /** Your own role can't be deleted from under you. */
  protected readonly lockedIds = computed(() =>
    this.rows()
      .filter((r) => this.auth.hasRole(r.name))
      .map((r) => r.id),
  );

  protected readonly selection = signal<Array<string | number>>([]);

  // Drawer (create / rename)
  protected readonly drawerOpen = signal(false);
  protected readonly editing = signal<RoleListItem | null>(null);

  // Delete confirmation (single or bulk)
  protected readonly pendingDelete = signal<RoleListItem[]>([]);
  protected readonly deleteMessage = computed(() => {
    const items = this.pendingDelete();
    if (!items.length) return "";
    const withUsers = items.filter((r) => r.countUsers > 0);
    const base =
      items.length === 1
        ? this.translate.instant("ROLES.DELETE.MESSAGE_ONE", { name: items[0].name })
        : this.translate.instant("ROLES.DELETE.MESSAGE_MANY", { count: items.length });
    return withUsers.length ? `${base} ${this.translate.instant("ROLES.DELETE.HAS_USERS")}` : base;
  });

  ngOnInit(): void {
    this.roles.load();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.drawerOpen.set(true);
  }

  protected openRename(role: RoleListItem, event: Event): void {
    event.stopPropagation();
    this.editing.set(role);
    this.drawerOpen.set(true);
  }

  protected onNameSubmitted(name: string): void {
    const role = this.editing();
    const request = role ? this.roles.rename(role.id, name) : this.roles.create(name);
    request.subscribe((ok) => ok && this.drawerOpen.set(false));
  }

  protected open(role: RoleListItem): void {
    this.router.navigate(["/main/roles", role.id]);
  }

  protected askDelete(role: RoleListItem, event: Event): void {
    event.stopPropagation();
    this.pendingDelete.set([role]);
  }

  protected askBulkDelete(): void {
    const ids = this.selection();
    this.pendingDelete.set(this.rows().filter((r) => ids.includes(r.id)));
  }

  protected confirmDelete(): void {
    const ids = this.pendingDelete().map((r) => r.id);
    this.roles.remove(ids).subscribe((ok) => {
      if (ok) {
        this.pendingDelete.set([]);
        this.selection.set([]);
      }
    });
  }

  protected onSearch(term: string): void {
    this.selection.set([]);
    this.roles.setSearch(term);
  }

  protected onPage(page: number): void {
    this.selection.set([]);
    this.roles.setPage(page);
  }

  protected reload(): void {
    this.roles.load();
  }
}
