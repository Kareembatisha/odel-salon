import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Loading placeholder. Compose it to mirror the layout that is loading:
 *   <app-skeleton width="40%" height="20px" />
 *   <app-skeleton shape="circle" width="40px" height="40px" />
 * Colors come from the theme tokens so it works in light and dark.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `<span class="sk" [class.sk--circle]="shape() === 'circle'" [style.width]="width()" [style.height]="height()" aria-hidden="true"></span>`,
  styleUrl: './skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  width = input<string>('100%');
  height = input<string>('16px');
  shape = input<'rect' | 'circle'>('rect');
}
