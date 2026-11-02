import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageService } from '../../../core/services/language.service';
import { PageHeaderComponent } from '../page-header/page-header.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

/** Sprint calendar from the delivery plan (Sprint 0 starts 5 Oct 2026, two weeks each). */
const SPRINT_DATES: Record<number, [string, string]> = {
  1: ['2026-10-19', '2026-11-01'],
  2: ['2026-11-02', '2026-11-15'],
  3: ['2026-11-16', '2026-11-29'],
  4: ['2026-11-30', '2026-12-13'],
  5: ['2026-12-14', '2026-12-27'],
  6: ['2026-12-28', '2027-01-10'],
  7: ['2027-01-11', '2027-01-24'],
};

/** Which sprint delivers each section, plus its icon. Key = route `data.feature`. */
const FEATURES: Record<string, { sprint: number; icon: string }> = {
  branches: { sprint: 1, icon: 'pi pi-map-marker' },
  users: { sprint: 1, icon: 'pi pi-user-edit' },
  roles: { sprint: 1, icon: 'pi pi-shield' },
  services: { sprint: 2, icon: 'pi pi-book' },
  barbers: { sprint: 2, icon: 'pi pi-users' },
  chairs: { sprint: 2, icon: 'pi pi-stop' },
  offers: { sprint: 2, icon: 'pi pi-percentage' },
  availability: { sprint: 3, icon: 'pi pi-clock' },
  bookings: { sprint: 4, icon: 'pi pi-calendar' },
  sessions: { sprint: 4, icon: 'pi pi-play-circle' },
  'booking-rules': { sprint: 4, icon: 'pi pi-sliders-h' },
  points: { sprint: 5, icon: 'pi pi-star' },
  'points-rules': { sprint: 5, icon: 'pi pi-star' },
  reviews: { sprint: 6, icon: 'pi pi-comments' },
  reports: { sprint: 6, icon: 'pi pi-chart-bar' },
  notifications: { sprint: 7, icon: 'pi pi-bell' },
};

/**
 * Stand-in for a section whose sprint hasn't started. Keeps the whole route
 * map, permissions, breadcrumbs and navigation real from day one; when a
 * sprint lands, the route swaps this component for the real feature page.
 * Content is driven by i18n keys FEATURES.<feature>.{TITLE,DESCRIPTION,SCOPE_1..3}.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feature-placeholder',
  standalone: true,
  imports: [TranslateModule, PageHeaderComponent, StatusBadgeComponent],
  template: `
    <div class="odl-page">
      <app-page-header [title]="('FEATURES.' + feature + '.TITLE') | translate"
                       [subtitle]="('FEATURES.' + feature + '.DESCRIPTION') | translate" />

      <section class="odl-card plan">
        <span class="plan__icon" aria-hidden="true"><i [class]="meta.icon"></i></span>
        <div class="plan__body">
          <app-status-badge variant="vip" [dot]="false">
            {{ 'PLACEHOLDER.SPRINT' | translate: { n: meta.sprint } }} · {{ dates() }}
          </app-status-badge>
          <h2 class="plan__title">{{ 'PLACEHOLDER.COMING_TITLE' | translate }}</h2>
          <ul class="plan__list">
            @for (n of [1, 2, 3]; track n) {
              <li><i class="pi pi-check-circle" aria-hidden="true"></i>{{ ('FEATURES.' + feature + '.SCOPE_' + n) | translate }}</li>
            }
          </ul>
        </div>
      </section>
    </div>
  `,
  styleUrl: './feature-placeholder.scss',
})
export class FeaturePlaceholder {
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  protected readonly feature: string = this.route.snapshot.data['feature'];
  protected readonly meta = FEATURES[this.feature] ?? { sprint: 1, icon: 'pi pi-box' };

  protected readonly dates = computed(() => {
    const [from, to] = SPRINT_DATES[this.meta.sprint] ?? SPRINT_DATES[1];
    const fmt = new Intl.DateTimeFormat(this.language.currentLang() === 'ar' ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });
    return `\u2068${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}\u2069`;
  });
}
