import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { AppButtonComponent } from '../app-button/app-button.component';

/**
 * Shared "failed to load" block. Drop it in wherever a service's `hasError()`
 * is true; the retry button emits `retry`.
 */
@Component({
  selector: 'app-failed-state',
  standalone: true,
  imports: [TranslateModule, AppButtonComponent],
  template: `
    <div class="failed" [class.failed--compact]="compact()" role="alert">
      <span class="failed__icon" aria-hidden="true"><i class="pi pi-exclamation-triangle"></i></span>
      <h3 class="failed__title">{{ titleKey() | translate }}</h3>
      <p class="failed__text">{{ subtitleKey() | translate }}</p>
      @if (showRetry()) {
        <app-button variant="outline" size="sm" iconClass="pi pi-refresh" (clicked)="retry.emit()">
          {{ 'COMMON.RETRY' | translate }}
        </app-button>
      }
    </div>
  `,
  styleUrl: './failed-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FailedStateComponent {
  titleKey = input<string>('COMMON.FAILED_STATE.TITLE');
  subtitleKey = input<string>('COMMON.FAILED_STATE.SUBTITLE');
  showRetry = input<boolean>(true);
  compact = input<boolean>(false);
  retry = output<void>();
}
