import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * "Nothing here yet" — explains what the area is for and offers the next
 * action (projected). Texts are already translated by the caller.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty" [class.empty--compact]="compact()">
      <span class="empty__icon" aria-hidden="true"><i [class]="icon()"></i></span>
      <h3 class="empty__title">{{ title() }}</h3>
      @if (description()) { <p class="empty__text">{{ description() }}</p> }
      <div class="empty__actions"><ng-content /></div>
    </div>
  `,
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  title = input.required<string>();
  description = input<string>('');
  icon = input<string>('pi pi-inbox');
  compact = input<boolean>(false);
}
