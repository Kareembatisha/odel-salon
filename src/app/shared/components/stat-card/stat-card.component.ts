import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatCardTone = 'gold' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';
export type StatTrendDirection = 'up' | 'down' | 'flat';

/**
 * Metric card for dashboards and list-page headers.
 * `label` and `hint` are already-translated strings (the card is i18n-agnostic).
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  /** PrimeIcons class, e.g. "pi pi-calendar". */
  icon = input.required<string>();
  tone = input<StatCardTone>('gold');
  /** Small comparison text, e.g. "+12% vs last week". */
  trend = input<string>('');
  trendDirection = input<StatTrendDirection>('flat');
  /** Optional supporting line under the value. */
  hint = input<string>('');
}
