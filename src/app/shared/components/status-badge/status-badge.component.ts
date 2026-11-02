import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Semantic variants shared by every list/detail page.
 *  success  active / confirmed / completed     warning  pending / expiring
 *  danger   cancelled / no-show / blocked      info     in progress / live
 *  neutral  inactive / draft                   vip      VIP chair or VIP price tier
 *
 * Mapping a domain status ("Confirmed", "NoShow"…) to a variant happens per
 * module — see shared/utils/status-badge.util.ts.
 */
export type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'vip';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="'badge badge--' + variant()">
    @if (dot()) { <span class="badge__dot" aria-hidden="true"></span> }
    <ng-content />
  </span>`,
  styleUrl: './status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  variant = input<StatusBadgeVariant>('neutral');
  /** Leading dot — on by default so status is never conveyed by color alone (text is always present too). */
  dot = input<boolean>(true);
}
