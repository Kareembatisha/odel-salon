import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { Permission } from '../../core/auth/permissions';
import { AuthService } from '../../modules/auth/service/auth.service';

/**
 * Renders its element only when the signed-in user holds the permission.
 *
 *   <app-button *appCan="PERMISSIONS.User.Create">Add user</app-button>
 *
 * UI convenience only — the backend (and the route guard) remain the real boundary.
 */
@Directive({ selector: '[appCan]', standalone: true })
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);

  readonly appCan = input.required<Permission>();
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.hasPermission(this.appCan());
      if (allowed && !this.shown) {
        this.container.createEmbeddedView(this.template);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.container.clear();
        this.shown = false;
      }
    });
  }
}
