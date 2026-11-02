import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/** 403 — shown inside the admin shell when the user lacks a route's permission. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-no-access',
  standalone: true,
  imports: [TranslateModule, AppButtonComponent, EmptyStateComponent],
  template: `
    <div class="odl-page">
      <div class="odl-card">
        <app-empty-state
          icon="pi pi-lock"
          [title]="'NO_ACCESS.TITLE' | translate"
          [description]="'NO_ACCESS.DESCRIPTION' | translate"
        >
          <div class="actions">
            <app-button variant="secondary" (clicked)="back()">{{ 'NO_ACCESS.GO_BACK' | translate }}</app-button>
            <app-button variant="primary" (clicked)="home()">{{ 'NO_ACCESS.BACK_HOME' | translate }}</app-button>
          </div>
        </app-empty-state>
      </div>
    </div>
  `,
  styles: [`.actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }`],
})
export class NoAccess {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected back(): void { this.location.back(); }
  protected home(): void { this.router.navigateByUrl('/main'); }
}
