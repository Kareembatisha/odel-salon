import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { labelOrFallback } from "@shared/utils/translate-label";
import { AuthService } from "../../../auth/service/auth.service";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { DrawerComponent } from "@shared/components/drawer/drawer.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { RoleForm } from "../../components/role-form/role-form";
import { PermissionModule, RoleDetails as RoleDetailsModel } from "../../model/role.model";
import { RolesService } from "../../service/roles.service";
import {
  ModuleState,
  enabledValues,
  moduleState,
  sameSelection,
  setModule,
  setPermission,
} from "../../utils/permission-matrix";

/**
 * Role details — the permission matrix. The page edits a working copy; nothing is
 * sent until "Save permissions" (PUT /roles/{id}/permissions replaces the full list).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-role-details",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    StatusBadgeComponent,
    DrawerComponent,
    FailedStateComponent,
    SkeletonComponent,
    RoleForm,
  ],
  templateUrl: "./role-details.html",
  styleUrl: "./role-details.scss",
})
export class RoleDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roles = inject(RolesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly breadcrumbs = inject(BreadcrumbService);

  protected readonly id = Number(this.route.snapshot.paramMap.get("id"));

  protected readonly role = signal<RoleDetailsModel | null>(null);
  /** Working copy the user edits. */
  protected readonly matrix = signal<PermissionModule[]>([]);
  /** Last saved state, to detect unsaved changes. */
  private readonly baseline = signal<PermissionModule[]>([]);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = this.roles.saving;
  protected readonly renameOpen = signal(false);

  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Role.Edit));
  protected readonly dirty = computed(() => !sameSelection(this.matrix(), this.baseline()));
  protected readonly enabledCount = computed(() => enabledValues(this.matrix()).length);
  protected readonly totalCount = computed(() =>
    this.matrix().reduce((n, m) => n + m.permissions.length, 0),
  );
  protected readonly isOwnRole = computed(() => {
    const role = this.role();
    return !!role && this.auth.hasRole(role.name);
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.roles.getRole(this.id).subscribe((role) => {
      this.loading.set(false);
      if (!role) {
        this.failed.set(true);
        return;
      }
      this.applyRole(role);
    });
  }

  private applyRole(role: RoleDetailsModel): void {
    const modules = role.modules ?? [];
    this.role.set(role);
    this.matrix.set(modules);
    this.baseline.set(modules);
    // The route's static breadcrumb says "Role"; swap in the real name.
    this.breadcrumbs.setBreadcrumbs([
      { label: "LAYOUT.NAV.ROLES_PERMISSIONS", route: "/main/roles" },
      { label: role.name },
    ]);
  }

  // ── Labels ───────────────────────────────────────────
  protected moduleLabel(module: string): string {
    return labelOrFallback(this.translate, `PERMISSIONS.MODULES.${module}`, module);
  }

  protected actionLabel(name: string): string {
    return labelOrFallback(this.translate, `PERMISSIONS.ACTIONS.${name}`, name);
  }

  protected state(m: PermissionModule): ModuleState {
    return moduleState(m);
  }

  protected moduleCount(m: PermissionModule): number {
    return m.permissions.filter((p) => p.isEnabled).length;
  }

  // ── Editing ──────────────────────────────────────────
  protected togglePermission(value: string, checked: boolean): void {
    if (!this.canEdit()) return;
    this.matrix.update((m) => setPermission(m, value, checked));
  }

  protected toggleModule(m: PermissionModule): void {
    if (!this.canEdit()) return;
    this.matrix.update((all) => setModule(all, m.module, moduleState(m) !== "all"));
  }

  protected discard(): void {
    this.matrix.set(this.baseline());
  }

  protected save(): void {
    const role = this.role();
    if (!role) return;
    this.roles
      .savePermissions(role.id, role.name, { permissions: enabledValues(this.matrix()) })
      .subscribe((ok) => {
        if (ok) this.baseline.set(this.matrix());
      });
  }

  protected rename(name: string): void {
    const role = this.role();
    if (!role) return;
    this.roles.rename(role.id, name).subscribe((ok) => {
      if (!ok) return;
      this.renameOpen.set(false);
      this.applyRole({ ...role, name, modules: this.matrix() });
    });
  }

  protected back(): void {
    this.router.navigate(["/main/roles"]);
  }
}
