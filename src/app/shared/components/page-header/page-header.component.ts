import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Title block at the top of every routed page.
 * Actions (buttons) are projected on the trailing side and wrap under the title on mobile.
 *
 *   <app-page-header [title]="'BRANCHES.TITLE' | translate" [subtitle]="...">
 *     <app-button variant="primary" iconClass="pi pi-plus">Add branch</app-button>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="ph">
      <div class="ph__text">
        <h1 class="ph__title">{{ title() }}</h1>
        @if (subtitle()) { <p class="ph__subtitle">{{ subtitle() }}</p> }
      </div>
      <div class="ph__actions"><ng-content /></div>
    </header>
  `,
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  title = input.required<string>();
  subtitle = input<string>('');
}
